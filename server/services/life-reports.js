// 生命周期深度管理 — 自动周报/月报/趋势分析
import { chatWithLLM, isAiEnabled } from './ai-engine.js';
import { getDb } from '../db/init.js';
import { v4 as uid } from 'uuid';
import { silent } from '../utils/silent.js';

// ===== Schema =====
function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS life_reports (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      report_type TEXT,
      period_start TEXT,
      period_end TEXT,
      summary TEXT,
      highlights TEXT,
      concerns TEXT,
      recommendations TEXT,
      data_snapshot TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ===== 数据采集 =====

function collectWeekData(db, userId) {
  const weekAgo = "datetime('now', '-7 days')";
  
  const checkins = db.prepare(`SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND checked_at >= ${weekAgo}`).get(userId)?.c || 0;
  const completedTasks = db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'completed' AND COALESCE(completed_at, created_at) >= ${weekAgo}`).get(userId)?.c || 0;
  const totalTasks = db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND COALESCE(completed_at, created_at) >= ${weekAgo}`).get(userId)?.c || 0;
  
  // 活跃维度
  const dimCounts = db.prepare(`
    SELECT dimension_id, COUNT(*) as c FROM tasks 
    WHERE user_id = ? AND status = 'completed' AND COALESCE(completed_at, created_at) >= ${weekAgo}
    GROUP BY dimension_id ORDER BY c DESC
  `).all(userId);
  
  // 聊天统计
  const chatCount = db.prepare(`SELECT COUNT(*) as c FROM chat_history WHERE user_id = ? AND created_at >= ${weekAgo}`).get(userId)?.c || 0;
  
  // 情绪趋势
  let emotions = [];
  try {
    emotions = db.prepare(`SELECT primary_emotion, COUNT(*) as c FROM emotion_log WHERE user_id = ? AND created_at >= ${weekAgo} GROUP BY primary_emotion`).all(userId);
  } catch (e) { silent('周报/情绪趋势', e); emotions = []; }
  
  // 用户状态
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  
  // 目标进度
  const goals = db.prepare('SELECT title, target_value, unit, deadline FROM goals WHERE user_id = ? AND deadline >= date(\'now\')').all(userId);
  
  // 概念空间
  let topConcepts = [];
  try {
    topConcepts = db.prepare('SELECT concept, strength FROM concept_graph WHERE user_id = ? ORDER BY strength DESC LIMIT 10').all(userId);
  } catch (e) { silent('周报/概念空间', e); }

  // 财务（expense_logs 表从未存在，此前该统计恒为 0，改用 finance_transactions）
  let weekExpense = 0;
  try {
    weekExpense = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM finance_transactions WHERE user_id = ? AND type = 'expense' AND transaction_date >= ${weekAgo}`).get(userId)?.total || 0;
  } catch (e) { silent('周报/财务支出', e); }

  return {
    checkins, completedTasks, totalTasks,
    taskCompletionRate: totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0,
    dimCounts, chatCount,
    emotions: emotions.reduce((acc, e) => { acc[e.primary_emotion] = e.c; return acc; }, {}),
    streak: user?.consecutive_sign_days || 0,
    level: user?.level || 1,
    exp: user?.exp || 0,
    stats: { health: user?.stat_health, career: user?.stat_career, finance: user?.stat_finance, learning: user?.stat_learning },
    goals: goals.map(g => `${g.title}(${g.target_value || '?'}${g.unit || ''})`),
    topConcepts: topConcepts.map(c => c.concept),
    weekExpense,
  };
}

// ===== LLM 生成周报 =====

export async function generateWeeklyReport(userId, userName = '用户') {
  if (!isAiEnabled()) return generateBasicReport(userId, userName, 'weekly');

  try {
    const db = getDb();
    ensureTable(db);
    const data = collectWeekData(db, userId);

    const prompt = `你是一位人生数据分析师。请根据以下本周数据，生成一份简洁有温度的个人周报。

用户: ${userName}

【本周数据】
- 完成任务: ${data.completedTasks}/${data.totalTasks}（完成率${data.taskCompletionRate}%）
- 打卡: ${data.checkins}次
- 聊天互动: ${data.chatCount}次
- 连续签到: ${data.streak}天
- 财务支出: ¥${data.weekExpense}
- 维度分: 健康${data.stats.health} 事业${data.stats.career} 财务${data.stats.finance} 学习${data.stats.learning}
- 情绪分布: ${JSON.stringify(data.emotions)}
- 活跃概念: ${data.topConcepts.slice(0, 5).join(', ')}
- 进行中目标: ${data.goals.slice(0, 3).join(', ')}

请生成周报，包含：
1️⃣ 本周亮点（1-2条，具体的事件或数据）
2️⃣ 需关注（1-2条，下滑的维度或情绪）
3️⃣ 建议（1-2条，下周可操作的建议）
4️⃣ 一句话总结

格式：每段一行，不要用markdown标题，用emoji开头。
回复简洁，总计200字以内。`;

    const result = await chatWithLLM([{ role: 'user', content: prompt }], { temperature: 0.5, maxTokens: 300 });
    
    if (result) {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      db.prepare(`
        INSERT INTO life_reports (id, user_id, report_type, period_start, period_end, summary, data_snapshot)
        VALUES (?, ?, 'weekly', ?, ?, ?, ?)
      `).run(uid(), userId, weekAgo.toISOString().split('T')[0], now.toISOString().split('T')[0], result, JSON.stringify(data));
    }

    return { type: 'weekly', text: result, data };
  } catch (e) {
    console.error('generateWeeklyReport:', e.message);
    return generateBasicReport(userId, userName, 'weekly');
  }
}

// ===== 基础统计（LLM不可用时）=====

function generateBasicReport(userId, userName, type) {
  const db = getDb();
  const data = collectWeekData(db, userId);
  
  const text = `📊 ${userName}的${type === 'weekly' ? '周' : '月'}报

✅ 完成任务 ${data.completedTasks} 个，完成率 ${data.taskCompletionRate}%
📝 打卡 ${data.checkins} 次
🔥 连续签到 ${data.streak} 天
${data.weekExpense > 0 ? `💰 本周支出 ¥${data.weekExpense}` : ''}
💪 健康${data.stats.health} 事业${data.stats.career} 财务${data.stats.finance} 学习${data.stats.learning}
${data.topConcepts.length > 0 ? `🧠 关注话题: ${data.topConcepts.slice(0, 5).join(', ')}` : ''}

继续加油！`;

  // 存储报告
  try {
    ensureTable(db);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    db.prepare(`
      INSERT INTO life_reports (id, user_id, report_type, period_start, period_end, summary, data_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uid(), userId, type, weekAgo.toISOString().split('T')[0], now.toISOString().split('T')[0], text, JSON.stringify(data));
  } catch {}

  return { type, text, data };
}

// ===== 月报（汇总4周数据）=====

export async function generateMonthlyReport(userId, userName = '用户') {
  if (!isAiEnabled()) return generateBasicReport(userId, userName, 'monthly');

  try {
    const db = getDb();
    ensureTable(db);
    
    // 取最近4周报告
    const recentReports = db.prepare(
      `SELECT summary, data_snapshot FROM life_reports WHERE user_id = ? AND report_type = 'weekly' ORDER BY created_at DESC LIMIT 4`
    ).all(userId);
    
    const data = collectWeekData(db, userId); // 用最近一周数据近似

    const summaries = recentReports.map(r => r.summary).join('\n---\n');

    const prompt = `用户: ${userName}。以下是最近4周的周报摘要，请汇总为月报。

${summaries || '（本周数据汇总）'}

请生成月报，包含：
1️⃣ 月度成就
2️⃣ 趋势变化（什么在变好/变差）
3️⃣ 下月建议
4️⃣ 一句话总结
200字以内。`;

    const result = await chatWithLLM([{ role: 'user', content: prompt }], { temperature: 0.5, maxTokens: 300 });

    if (result) {
      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 86400000);
      db.prepare(`
        INSERT INTO life_reports (id, user_id, report_type, period_start, period_end, summary, data_snapshot)
        VALUES (?, ?, 'monthly', ?, ?, ?, ?)
      `).run(uid(), userId, monthAgo.toISOString().split('T')[0], now.toISOString().split('T')[0], result, JSON.stringify(data));
    }

    return { type: 'monthly', text: result, data };
  } catch (e) {
    console.error('generateMonthlyReport:', e.message);
    return generateBasicReport(userId, userName, 'monthly');
  }
}

// ===== 历史报告 =====

export function getReports(userId, limit = 10) {
  const db = getDb();
  ensureTable(db);
  return db.prepare(
    'SELECT * FROM life_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit);
}

// ===== 趋势分析 =====

export function getTrendAnalysis(userId) {
  const db = getDb();
  const reports = getReports(userId, 4);
  
  if (reports.length < 2) return { message: '数据不足，需要至少2份周报' };

  let improving = [];
  let declining = [];

  for (let i = 1; i < reports.length; i++) {
    const prev = JSON.parse(reports[i].data_snapshot || '{}');
    const curr = JSON.parse(reports[i - 1].data_snapshot || '{}');
    
    if (curr.completedTasks > prev.completedTasks) improving.push('任务完成量');
    else if (curr.completedTasks < prev.completedTasks) declining.push('任务完成量');
    
    if (curr.checkins > prev.checkins) improving.push('打卡频率');
    else if (curr.checkins < prev.checkins) declining.push('打卡频率');
  }

  return {
    improving: [...new Set(improving)],
    declining: [...new Set(declining)],
    reportCount: reports.length,
  };
}
