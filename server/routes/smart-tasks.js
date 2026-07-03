import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { chatWithLLM, isAiEnabled } from '../services/ai-engine.js';

const router = Router();

// 动态生成每日任务（基于档案+LLM+能量）
router.post('/generate-smart', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    const today = new Date().toISOString().split('T')[0];
    
    const existing = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ?").get(user.id, today);
    if (existing.c > 0) return res.json({ success: false, message: '今天的任务已经生成了~' });
    
    // 计算能量值决定任务数量
    const streak = user.consecutive_sign_days;
    const todayCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(user.id, today);
    const recentEmotion = db.prepare("SELECT mood_score FROM emotion_logs WHERE user_id = ? ORDER BY log_date DESC LIMIT 1").get(user.id);
    let energy = 50 + Math.min(streak * 2, 20) + Math.min(todayCheckins.c * 3, 15);
    if (recentEmotion?.mood_score) energy += (recentEmotion.mood_score - 3) * 5;
    energy = Math.max(0, Math.min(100, energy));
    
    // 能量决定任务数：高能量多任务，低能量少任务
    let taskCount;
    if (energy >= 80) taskCount = 6;
    else if (energy >= 60) taskCount = 5;
    else if (energy >= 40) taskCount = 4;
    else if (energy >= 20) taskCount = 3;
    else taskCount = 2;
    
    let tasks;
    if (isAiEnabled() && profile?.onboarding_completed) {
      tasks = await generateLLMTasks(db, user, profile, taskCount);
    }
    if (!tasks) tasks = generateProfileBasedTasks(user, profile, taskCount);
    
    const stmt = db.prepare(`INSERT INTO tasks (id, user_id, dimension_id, title, description, task_type, difficulty, exp_reward, coin_reward, scheduled_date) VALUES (?, ?, ?, ?, ?, 'daily', ?, ?, ?, ?)`);
    for (const t of tasks) {
      stmt.run(uuid(), user.id, t.dimension, t.title, t.description, t.difficulty, t.exp, t.coins, today);
    }
    
    const energyMsg = energy >= 60 ? '' : `（检测到能量较低，已减少任务数量，不要勉强哦~）`;
    res.json({ success: true, count: tasks.length, energy, tasks, message: `为你生成了${tasks.length}个任务~ 🎯${energyMsg}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function generateLLMTasks(db, user, profile) {
  try {
    // 获取最近完成情况
    const recentCompleted = db.prepare("SELECT dimension_id, COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'completed' AND created_at > datetime('now', '-7 days') GROUP BY dimension_id").all(user.id);
    const recentMissed = db.prepare("SELECT dimension_id, COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'pending' AND scheduled_date < date('now') GROUP BY dimension_id").all(user.id);
    
    const prompt = `你是猫猫侠的任务规划引擎。基于用户档案生成今天的个性化任务。

【用户档案】
- 职业：${profile.current_job || '未知'}，${profile.industry || ''}行业
- 身体：${profile.height_cm || '?'}cm/${profile.weight_kg || '?'}kg，睡眠${profile.sleep_hours_avg || '?'}h，运动${profile.exercise_frequency || '未知'}
- 性格：${safeJoin(profile.personality_traits)}
- 当前挑战：${safeJoin(profile.current_challenges)}
- 想学的：${safeJoin(profile.want_to_learn)}
- 理想生活：${profile.ideal_life_description || '未描述'}
- 属性：健康${user.stat_health} 财务${user.stat_finance} 学习${user.stat_learning} 职业${user.stat_career} 社交${user.stat_social} 心理${user.stat_mental} 习惯${user.stat_habits} 创造${user.stat_creativity}

【最近完成情况】${recentCompleted.map(r => `${r.dimension_id}:${r.c}个`).join(', ') || '无'}
【最近未完成】${recentMissed.map(r => `${r.dimension_id}:${r.c}个`).join(', ') || '无'}

请生成4-6个今日任务，JSON数组格式，每个任务包含：
- dimension: health/finance/learning/career/social/mental/habits/creativity
- title: 简短标题
- description: 具体描述（怎么做）
- difficulty: easy/medium/hard
- exp: 经验值(10-40)
- coins: 金币(5-20)

要求：
1. 优先安排最弱维度的任务
2. 结合用户的职业和兴趣
3. 任务要具体可执行（不要"学习1小时"，要"看React文档第3章"）
4. 难度适中，不要太难
5. 每天任务要有变化，不要重复

只返回JSON数组，不要其他内容。`;

    const response = await chatWithLLM([
      { role: 'system', content: prompt },
      { role: 'user', content: '生成今天的任务' }
    ], { temperature: 0.9, maxTokens: 800 });
    
    if (response) {
      // 提取JSON
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const tasks = JSON.parse(jsonMatch[0]);
        if (Array.isArray(tasks) && tasks.length > 0) return tasks;
      }
    }
  } catch (e) {
    console.error('LLM任务生成失败:', e.message);
  }
  return null;
}

function generateProfileBasedTasks(user, profile) {
  const tasks = [];
  const dims = [
    { id: 'health', val: user.stat_health },
    { id: 'finance', val: user.stat_finance },
    { id: 'learning', val: user.stat_learning },
    { id: 'career', val: user.stat_career },
    { id: 'social', val: user.stat_social },
    { id: 'mental', val: user.stat_mental },
    { id: 'habits', val: user.stat_habits },
    { id: 'creativity', val: user.stat_creativity },
  ].sort((a, b) => a.val - b.val);
  
  // 基础任务
  tasks.push({ dimension: 'health', title: '喝8杯水', description: '保持身体水分', difficulty: 'easy', exp: 10, coins: 5 });
  tasks.push({ dimension: 'habits', title: '今日复盘', description: '回顾今天的收获', difficulty: 'easy', exp: 15, coins: 8 });
  
  // 基于最弱维度的任务
  const weakest = dims[0];
  const weakTasks = {
    health: { title: '运动30分钟', description: '跑步/健身/散步', difficulty: 'medium', exp: 20, coins: 10 },
    finance: { title: '记录今日支出', description: '记账是理财第一步', difficulty: 'easy', exp: 10, coins: 5 },
    learning: { title: '学习1小时', description: '专注学习新知识', difficulty: 'medium', exp: 20, coins: 10 },
    career: { title: '学习行业知识', description: '阅读行业文章或文档', difficulty: 'medium', exp: 20, coins: 10 },
    social: { title: '联系一个朋友', description: '发消息问候', difficulty: 'easy', exp: 10, coins: 5 },
    mental: { title: '冥想10分钟', description: '放空大脑，深呼吸', difficulty: 'easy', exp: 10, coins: 5 },
    habits: { title: '早起打卡', description: '7点前起床', difficulty: 'medium', exp: 15, coins: 8 },
    creativity: { title: '创作30分钟', description: '写/画/拍/做任何创作', difficulty: 'medium', exp: 20, coins: 10 },
  };
  tasks.push({ dimension: weakest.id, ...weakTasks[weakest.id] });
  
  // 基于档案的任务
  if (profile?.want_to_learn) {
    try {
      const skills = JSON.parse(profile.want_to_learn);
      if (skills.length > 0) {
        const skill = skills[Math.floor(Math.random() * skills.length)];
        tasks.push({ dimension: 'learning', title: `学习${skill}`, description: `花30分钟学习${skill}`, difficulty: 'medium', exp: 20, coins: 10 });
      }
    } catch {}
  }
  
  // 随机额外任务
  const extras = [
    { dimension: 'mental', title: '写日记', description: '记录今天的心情和想法', difficulty: 'easy', exp: 10, coins: 5 },
    { dimension: 'creativity', title: '尝试新事物', description: '做一件以前没做过的事', difficulty: 'medium', exp: 25, coins: 12 },
    { dimension: 'social', title: '给家人打电话', description: '问候家人', difficulty: 'easy', exp: 10, coins: 5 },
  ];
  tasks.push(extras[Math.floor(Math.random() * extras.length)]);
  
  return tasks;
}

function safeJoin(jsonStr) {
  try { const arr = JSON.parse(jsonStr); return Array.isArray(arr) ? arr.join('、') : ''; } catch { return ''; }
}

export default router;
