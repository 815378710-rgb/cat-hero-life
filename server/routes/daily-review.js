import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { chatWithLLM, isAiEnabled } from '../services/ai-engine.js';

const router = Router();

// 开始每日复盘
router.post('/start', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];
    
    // 获取今日数据
    const tasks = db.prepare("SELECT * FROM tasks WHERE user_id = ? AND scheduled_date = ?").all(user.id, today);
    const checkins = db.prepare("SELECT * FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").all(user.id, today);
    const habits = db.prepare("SELECT h.*, (SELECT COUNT(*) FROM habit_logs hl WHERE hl.habit_id = h.id AND date(hl.logged_at) = date('now')) as today_count FROM habits h WHERE h.user_id = ? AND h.is_active = 1").all(user.id);
    
    const completed = tasks.filter(t => t.status === 'completed').length;
    const total = tasks.length;
    
    // 生成复盘开场白
    let greeting;
    if (isAiEnabled()) {
      greeting = await chatWithLLM([
        { role: 'system', content: `你是猫猫侠，正在做每日复盘。基于今天的数据，用温暖的语气开始复盘对话。

今日数据：
- 任务：完成${completed}/${total}个
- 打卡：${checkins.length}次
- 习惯：${habits.map(h => `${h.name}${h.today_count > 0 ? '✅' : '❌'}`).join(', ')}
- 连续签到：${user.consecutive_sign_days}天
- 等级：Lv.${user.level}

要求：
1. 先肯定今天做得好的地方
2. 温和地指出可以改进的地方
3. 问用户今天感觉怎么样
4. 2-4句话，不要太长` },
        { role: 'user', content: '开始今日复盘' }
      ], { temperature: 0.9, maxTokens: 300 });
    }
    
    if (!greeting) {
      greeting = `🐱 晚上好~ 来做今日复盘吧！\n\n今天完成了${completed}/${total}个任务，打卡${checkins.length}次。${completed === total && total > 0 ? '全部完成，太棒了！' : '还有进步空间~'}\n\n今天感觉怎么样？有什么想说的吗？`;
    }
    
    // 保存复盘对话
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'assistant', ?)").run(user.id, greeting);
    
    res.json({ 
      success: true, 
      greeting,
      summary: { completed, total, checkins: checkins.length, habits: habits.map(h => ({ name: h.name, done: h.today_count > 0 })) }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 复盘对话
router.post('/chat', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const { message } = req.body;
    const today = new Date().toISOString().split('T')[0];
    
    // 保存用户消息
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', ?)").run(user.id, message);
    
    // 分析情绪
    const emotion = analyzeEmotion(message);
    
    // 记录情绪日志
    db.prepare(`INSERT INTO emotion_logs (id, user_id, log_date, mood_score, mood_text, energy, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, log_date) DO UPDATE SET mood_score = ?, mood_text = ?, energy = ?, note = ?`)
      .run(uuid(), user.id, today, emotion.score, emotion.label, emotion.energy, message, emotion.score, emotion.label, emotion.energy, message);
    
    // AI回复
    let response;
    if (isAiEnabled()) {
      const tasks = db.prepare("SELECT * FROM tasks WHERE user_id = ? AND scheduled_date = ?").all(user.id, today);
      const completed = tasks.filter(t => t.status === 'completed').length;
      
      response = await chatWithLLM([
        { role: 'system', content: `你是猫猫侠，正在做每日复盘。用户刚分享了今天的感受。

今日任务完成：${completed}/${tasks.length}
用户情绪：${emotion.label}（${emotion.score}/5）
用户说："${message}"

要求：
1. 共情用户的感受
2. 如果用户提到了具体问题，给出建议
3. 问明天有什么计划或需要安排的任务
4. 温暖、简短（2-3句话）` },
        { role: 'user', content: message }
      ], { temperature: 0.9, maxTokens: 300 });
    }
    
    if (!response) {
      const responses = {
        positive: '🐱 太好了！保持这个状态~ 明天有什么想做的吗？',
        neutral: '🐱 嗯嗯，平淡也是一种幸福~ 明天有什么安排吗？',
        negative: '🐱 辛苦了... 不开心的时候记得还有我在~ 明天要不要轻松一点？',
        tired: '🐱 累了就好好休息~ 明天我帮你安排轻松一点的任务？',
      };
      response = responses[emotion.label] || responses.neutral;
    }
    
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'assistant', ?)").run(user.id, response);
    
    res.json({ success: true, response, emotion });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 完成复盘（生成明日计划）
router.post('/complete', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    
    // 获取今日情绪
    const emotion = db.prepare("SELECT * FROM emotion_logs WHERE user_id = ? AND log_date = ?").get(user.id, today);
    
    // 生成明日任务（根据今日完成情况和情绪调整）
    const todayTasks = db.prepare("SELECT * FROM tasks WHERE user_id = ? AND scheduled_date = ?").all(user.id, today);
    const missedTasks = todayTasks.filter(t => t.status === 'pending');
    
    // 把未完成的任务推到明天
    for (const task of missedTasks) {
      db.prepare("UPDATE tasks SET scheduled_date = ? WHERE id = ?").run(tomorrow, task.id);
    }
    
    // 记录每日报告
    const completed = todayTasks.filter(t => t.status === 'completed').length;
    db.prepare(`INSERT OR REPLACE INTO daily_reports (id, user_id, report_date, summary, tasks_completed, tasks_total, mood_avg)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(uuid(), user.id, today, `完成${completed}/${todayTasks.length}个任务`, completed, todayTasks.length, emotion?.mood_score || null);
    
    let closingMsg = `🐱 复盘完成！今天${completed}个任务已完成，${missedTasks.length}个推到了明天。好好休息，明天继续加油~ ⭐`;
    
    if (isAiEnabled()) {
      const aiMsg = await chatWithLLM([
        { role: 'system', content: `你是猫猫侠，复盘结束了。总结今天，展望明天。1-2句话，温暖收尾。今日完成${completed}/${todayTasks.length}，情绪${emotion?.mood_score || '?'}/5` },
        { role: 'user', content: '复盘结束' }
      ], { temperature: 0.9, maxTokens: 150 });
      if (aiMsg) closingMsg = aiMsg;
    }
    
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'assistant', ?)").run(user.id, closingMsg);
    
    res.json({ success: true, message: closingMsg, tomorrowTasks: missedTasks.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取情绪历史
router.get('/emotions', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { days } = req.query;
    const limit = parseInt(days) || 30;
    
    const emotions = db.prepare("SELECT * FROM emotion_logs WHERE user_id = ? ORDER BY log_date DESC LIMIT ?").all(user.id, limit);
    
    // 计算平均情绪
    const avg = emotions.length > 0 ? emotions.reduce((s, e) => s + (e.mood_score || 3), 0) / emotions.length : 0;
    
    res.json({ emotions, average: Math.round(avg * 10) / 10, count: emotions.length });
  } catch (e) { res.json({ emotions: [], average: 0, count: 0 }); }
});

function analyzeEmotion(text) {
  const positive = ['开心', '高兴', '棒', '好', '爽', '不错', '满意', '完成', '成功', '进步', '收获'];
  const negative = ['累', '烦', '难过', '焦虑', '压力', '崩溃', '累', '困', '不想', '失败', '糟糕'];
  const tired = ['累', '疲惫', '困', '没精神', '想睡', '休息'];
  
  const posCount = positive.filter(w => text.includes(w)).length;
  const negCount = negative.filter(w => text.includes(w)).length;
  const tirCount = tired.filter(w => text.includes(w)).length;
  
  let score, label, energy;
  
  if (tirCount > 0) { score = 2; label = 'tired'; energy = 2; }
  else if (posCount > negCount) { score = 4; label = 'positive'; energy = 4; }
  else if (negCount > posCount) { score = 2; label = 'negative'; energy = 2; }
  else { score = 3; label = 'neutral'; energy = 3; }
  
  return { score, label, energy };
}

export default router;
