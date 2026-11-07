// 猫猫侠 AI数据分析 - 基于真实用户数据的智能分析
import { chatWithLLM, isAiEnabled } from './ai-engine.js';

/**
 * 收集用户数据并构建分析prompt，调用LLM生成分析报告
 * @param {Object} db - 数据库wrapper
 * @returns {Object} { analysis, insights, recommendations }
 */
export async function generateAnalysis(db) {
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) throw new Error('未找到用户');

  // 1. 最近7天财务数据
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const financeStats = db.prepare(
    'SELECT date, today_income, today_expense FROM finance_stats WHERE user_id = ? AND date >= ? ORDER BY date'
  ).all(user.id, weekAgo);

  // 2. 最近7天打卡（按维度分组）
  const checkins = db.prepare(
    `SELECT ld.name as dimension, COUNT(*) as count
     FROM check_ins ci
     JOIN life_dimensions ld ON ci.dimension_id = ld.id
     WHERE ci.user_id = ? AND date(ci.checked_at) >= ?
     GROUP BY ci.dimension_id
     ORDER BY count DESC`
  ).all(user.id, weekAgo);

  // 3. 当前维度得分
  const dimensions = [
    { key: 'health', name: '健康' },
    { key: 'finance', name: '财务' },
    { key: 'learning', name: '学习' },
    { key: 'career', name: '职业' },
    { key: 'social', name: '社交' },
    { key: 'mental', name: '心理' },
    { key: 'habits', name: '习惯' },
    { key: 'creativity', name: '创造' },
  ];
  const scores = dimensions.map(d => ({
    name: d.name,
    score: user[`stat_${d.key}`] || 0
  }));

  // 4. 最近10条聊天记录
  const chatHistory = db.prepare(
    "SELECT role, content, created_at FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10"
  ).all(user.id).reverse();

  // 构建提示词
  const financeText = financeStats.length > 0
    ? financeStats.map(f => `- ${f.date}: 收入${f.today_income}元 / 支出${f.today_expense}元`).join('\n')
    : '（无财务数据）';

  const checkinText = checkins.length > 0
    ? checkins.map(c => `- ${c.dimension}: ${c.count}次`).join('\n')
    : '（无打卡数据）';

  const scoreText = scores.map(s => `- ${s.name}: ${s.score}/100`).join('\n');

  const chatText = chatHistory.length > 0
    ? chatHistory.map(c => `- [${c.role}] ${c.content.slice(0, 80)}`).join('\n')
    : '（无聊天记录）';

  const prompt = `你是猫猫侠AI分析师。请根据以下用户真实数据生成一份简短的分析报告。

【用户数据】
等级: Lv.${user.level} | 连续签到: ${user.consecutive_sign_days}天

【最近7天财务】
${financeText}

【最近7天打卡分布】
${checkinText}

【当前维度得分】
${scoreText}

【最近聊天记录】
${chatText}

请分析：
1. 用户的整体状态和趋势
2. 发现的问题和亮点
3. 给出具体的改进建议

返回纯JSON格式（不要markdown代码块）：
{
  "analysis": "简短的整体分析(2-3句话)",
  "insights": ["洞察1", "洞察2", "洞察3"],
  "recommendations": ["建议1", "建议2", "建议3"]
}`;

  // 调用LLM
  let result = null;
  if (isAiEnabled()) {
    try {
      const llmResponse = await chatWithLLM(
        [{ role: 'user', content: prompt }],
        { temperature: 0.5, maxTokens: 600 }
      );
      if (llmResponse) {
        const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) result = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('AI分析失败:', e.message);
    }
  }

  // LLM不可用时用规则引擎生成
  if (!result) {
    result = generateFallbackAnalysis(user, financeStats, checkins, scores);
  }

  return result;
}

/**
 * 规则引擎兜底分析（LLM不可用时）
 */
function generateFallbackAnalysis(user, financeStats, checkins, scores) {
  const totalIncome = financeStats.reduce((s, f) => s + (f.today_income || 0), 0);
  const totalExpense = financeStats.reduce((s, f) => s + (f.today_expense || 0), 0);
  const sortedScores = [...scores].sort((a, b) => a.score - b.score);
  const weakest = sortedScores[0];
  const strongest = sortedScores[sortedScores.length - 1];
  const totalCheckins = checkins.reduce((s, c) => s + c.count, 0);

  const insights = [];
  const recommendations = [];

  if (totalIncome > totalExpense) {
    insights.push(`本周财务状况良好，收入(${totalIncome}元)大于支出(${totalExpense}元)`);
  } else if (totalExpense > 0) {
    insights.push(`本周支出(${totalExpense}元)大于收入(${totalIncome}元)，需要注意控制消费`);
    recommendations.push('建议记录每日支出，找出不必要的消费');
  }

  if (weakest.score < 30) {
    insights.push(`「${weakest.name}」维度得分最低(${weakest.score}分)，需要重点关注`);
    recommendations.push(`每天安排一个「${weakest.name}」相关的小任务`);
  }

  if (strongest.score > 60) {
    insights.push(`「${strongest.name}」维度表现最好(${strongest.score}分)，继续保持`);
  }

  if (totalCheckins === 0) {
    insights.push('最近7天没有打卡记录');
    recommendations.push('从今天开始每天打卡，让数据更有意义');
  } else if (totalCheckins < 7) {
    insights.push(`最近7天共打卡${totalCheckins}次，坚持得不错`);
    recommendations.push('尝试每天至少打卡1次，建立连续性');
  } else {
    insights.push(`最近7天打卡${totalCheckins}次，表现优秀`);
  }

  if (user.consecutive_sign_days >= 7) {
    insights.push(`已连续签到${user.consecutive_sign_days}天，毅力惊人`);
  }

  if (recommendations.length === 0) {
    recommendations.push('继续保持当前节奏，稳步提升各维度');
  }

  return {
    analysis: `用户等级Lv.${user.level}，连续签到${user.consecutive_sign_days}天。` +
      (weakest.score < 40 ? `最弱维度「${weakest.name}」(${weakest.score}分)需要关注。` : '各维度发展均衡。') +
      (totalExpense > totalIncome ? '财务上支出略高于收入。' : '财务状态稳定。'),
    insights,
    recommendations,
  };
}

/**
 * 执行每日分析并通过微信推送
 */
export async function runDailyAnalysis() {
  const { getDb, createDbWrapper } = await import('../db/init.js');
  const db = createDbWrapper(getDb());

  try {
    const analysis = await generateAnalysis(db);
    const message = `📊 猫猫侠每日分析报告\n\n${analysis.analysis}\n\n💡 洞察：\n${analysis.insights.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\n📋 建议：\n${analysis.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;

    try {
      await fetch('http://127.0.0.1:3000/api/wechat-bot/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      console.log('📊 每日分析已推送到微信');
    } catch (e) {
      console.error('推送微信失败:', e.message);
    }

    return analysis;
  } catch (e) {
    console.error('每日分析失败:', e.message);
    return null;
  }
}
