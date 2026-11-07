import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { chatWithLLM, isAiEnabled } from '../services/ai-engine.js';

const router = Router();

// ===== 打卡热力图 =====
router.get('/heatmap', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { days, dimension_id } = req.query;
    const limit = parseInt(days) || 365;
    const startDate = new Date(Date.now() - limit * 86400000).toISOString().split('T')[0];
    
    let sql = `SELECT date(checked_at) as day, COUNT(*) as count FROM check_ins WHERE user_id = ? AND date(checked_at) >= ?`;
    const params = [user.id, startDate];
    if (dimension_id) { sql += ' AND dimension_id = ?'; params.push(dimension_id); }
    sql += ' GROUP BY date(checked_at) ORDER BY day';
    
    const data = db.prepare(sql).all(...params);
    
    // 生成365天的完整数据（含0天）
    const heatmap = {};
    for (const d of data) heatmap[d.day] = d.count;
    
    const result = [];
    for (let i = limit - 1; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      result.push({ date, count: heatmap[date] || 0 });
    }
    
    res.json({ heatmap: result, total: data.reduce((s, d) => s + d.count, 0), activeDays: data.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 能量系统 =====
router.get('/energy', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id, username, level, exp, coins, total_exp, consecutive_sign_days, last_sign_date, stat_health, stat_finance, stat_learning, stat_career, stat_social, stat_mental, stat_habits, stat_creativity, personality_type, personality_prompt FROM users LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    // 今日打卡数
    const todayCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(user.id, today);
    // 今日完成任务数
    const completedTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(user.id, today);
    // 连续签到
    const streak = user.consecutive_sign_days;
    // 最近情绪
    const recentEmotion = db.prepare("SELECT mood_score FROM emotion_logs WHERE user_id = ? ORDER BY log_date DESC LIMIT 1").get(user.id);
    // 最近睡眠（从打卡记录推断）
    const sleepCheckin = db.prepare("SELECT value FROM check_ins WHERE user_id = ? AND title LIKE '%睡%' ORDER BY checked_at DESC LIMIT 1").get(user.id);
    
    // 计算能量值 (0-100)
    let energy = 50; // 基础值
    
    // 签到加成
    energy += Math.min(streak * 2, 20);
    // 今日打卡加成
    energy += Math.min(todayCheckins.c * 3, 15);
    // 完成任务加成
    energy += Math.min(completedTasks.c * 5, 20);
    // 情绪加成
    if (recentEmotion?.mood_score) energy += (recentEmotion.mood_score - 3) * 5;
    
    energy = Math.max(0, Math.min(100, energy));
    
    // 能量等级
    let level, label, color, suggestion;
    if (energy >= 80) { level = 'high'; label = '满电状态'; color = '#4CAF50'; suggestion = '今天精力充沛，可以挑战高难度任务！'; }
    else if (energy >= 60) { level = 'good'; label = '状态不错'; color = '#4ECDC4'; suggestion = '精力良好，适合完成计划内的任务。'; }
    else if (energy >= 40) { level = 'medium'; label = '一般状态'; color = '#FF9800'; suggestion = '精力一般，建议做简单任务，不要勉强。'; }
    else if (energy >= 20) { level = 'low'; label = '状态低迷'; color = '#FF5722'; suggestion = '精力不足，建议休息，只做最紧急的事。'; }
    else { level = 'empty'; label = '电量耗尽'; color = '#F44336'; suggestion = '你需要休息。今天什么都不做也可以。'; }
    
    res.json({ energy, level, label, color, suggestion, factors: { streak, todayCheckins: todayCheckins.c, completedTasks: completedTasks.c, mood: recentEmotion?.mood_score || 3 } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 周复盘 =====
router.get('/weekly-review', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id, username, level, exp, coins, total_exp, consecutive_sign_days, last_sign_date, stat_health, stat_finance, stat_learning, stat_career, stat_social, stat_mental, stat_habits, stat_creativity, personality_type, personality_prompt FROM users LIMIT 1').get();
    const today = new Date();
    const weekStart = new Date(today - today.getDay() * 86400000).toISOString().split('T')[0];
    const weekEnd = today.toISOString().split('T')[0];
    
    // 本周任务统计
    const taskStats = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed FROM tasks WHERE user_id = ? AND scheduled_date BETWEEN ? AND ?`).get(user.id, weekStart, weekEnd);
    
    // 本周打卡统计
    const checkinStats = db.prepare(`SELECT date(checked_at) as day, COUNT(*) as count FROM check_ins WHERE user_id = ? AND checked_at BETWEEN ? AND ? GROUP BY date(checked_at) ORDER BY day`).all(user.id, weekStart, weekEnd);
    
    // 本周习惯完成率
    const habits = db.prepare(`SELECT h.name, h.target_count, (SELECT COUNT(DISTINCT date(hl.logged_at)) FROM habit_logs hl WHERE hl.habit_id = h.id AND hl.logged_at BETWEEN ? AND ?) as done_days FROM habits h WHERE h.user_id = ? AND h.is_active = 1`).all(weekStart, weekEnd, user.id);
    
    // 本周情绪
    const emotions = db.prepare(`SELECT AVG(mood_score) as avg_mood FROM emotion_logs WHERE user_id = ? AND log_date BETWEEN ? AND ?`).get(user.id, weekStart, weekEnd);
    
    // 属性变化（与上周对比）
    const lastWeekStart = new Date(today.getTime() - 7 * 86400000 - today.getDay() * 86400000).toISOString().split('T')[0];
    const lastWeekReport = null; // 无需对比
    
    const completionRate = taskStats.total > 0 ? Math.round(taskStats.completed / taskStats.total * 100) : 0;
    const totalCheckins = checkinStats.reduce((s, d) => s + d.count, 0);
    
    // 生成周报摘要
    let summary = '';
    if (isAiEnabled()) {
      summary = await chatWithLLM([
        { role: 'system', content: `你是猫猫侠，生成本周复盘报告。简洁、温暖、有建设性。

本周数据：
- 任务完成率：${completionRate}%（${taskStats.completed}/${taskStats.total}）
- 总打卡：${totalCheckins}次
- 平均情绪：${emotions.avg_mood ? emotions.avg_mood.toFixed(1) : '无数据'}/5
- 习惯完成：${habits.map(h => `${h.name}${h.done_days}/${7}天`).join('、')}
- 签到天数：${checkinStats.length}/7天

写100-150字的周报，包括：做得好的、需要改进的、下周建议。` },
        { role: 'user', content: '生成本周复盘' }
      ], { temperature: 0.8, maxTokens: 300 });
    }
    
    if (!summary) {
      summary = `本周完成了${completionRate}%的任务，打卡${totalCheckins}次。${completionRate >= 80 ? '表现优秀！继续保持！' : completionRate >= 50 ? '还有提升空间，下周加油！' : '任务完成率偏低，下周试试减少任务数量。'}`;
    }
    
    res.json({
      period: { start: weekStart, end: weekEnd },
      tasks: { ...taskStats, completionRate },
      checkins: { total: totalCheckins, days: checkinStats.length },
      habits,
      emotions: { average: emotions.avg_mood ? Math.round(emotions.avg_mood * 10) / 10 : null },
      summary
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 任务智能排序 =====
router.get('/task-priority', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id, username, level, exp, coins, total_exp, consecutive_sign_days, last_sign_date, stat_health, stat_finance, stat_learning, stat_career, stat_social, stat_mental, stat_habits, stat_creativity, personality_type, personality_prompt FROM users LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();
    
    const tasks = db.prepare(`SELECT t.*, ld.name as dimension_name, ld.icon as dimension_icon FROM tasks t LEFT JOIN life_dimensions ld ON t.dimension_id = ld.id WHERE t.user_id = ? AND t.scheduled_date = ? AND t.status = 'pending'`).all(user.id, today);
    
    // 根据时间段和难度排序
    const sorted = tasks.map(t => {
      let score = 0;
      // 上午(6-12)：优先难任务
      if (hour >= 6 && hour < 12) {
        if (t.difficulty === 'hard') score += 30;
        else if (t.difficulty === 'medium') score += 20;
        else score += 10;
      }
      // 下午(12-18)：中等任务
      else if (hour >= 12 && hour < 18) {
        if (t.difficulty === 'medium') score += 30;
        else score += 15;
      }
      // 晚上(18-24)：简单任务
      else {
        if (t.difficulty === 'easy') score += 30;
        else score += 10;
      }
      // 最弱维度加分
      const weakest = ['health','finance','learning','career','social','mental','habits','creativity']
        .map(d => ({ dim: d, val: user['stat_'+d] })).sort((a, b) => a.val - b.val)[0];
      if (t.dimension_id === weakest.dim) score += 20;
      
      return { ...t, priority_score: score };
    }).sort((a, b) => b.priority_score - a.priority_score);
    
    const timeLabel = hour >= 6 && hour < 12 ? '上午' : hour >= 12 && hour < 18 ? '下午' : '晚上';
    const advice = hour >= 6 && hour < 12 ? '现在精力最充沛，建议先做最难的任务！' : hour >= 12 && hour < 18 ? '下午适合做中等难度的任务。' : '晚上适合做轻松的任务，不要太累。';
    
    res.json({ tasks: sorted, timeLabel, advice });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 数据导出 =====
router.get('/export/:type', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { type } = req.params;
    
    switch (type) {
      case 'checkins': {
        const data = db.prepare("SELECT * FROM check_ins WHERE user_id = ? ORDER BY checked_at DESC").all(user.id);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=checkins.csv');
        res.send('日期,维度,标题,数值,心情,精力\n' + data.map(d => `${d.checked_at},${d.dimension_id},${d.title},${d.value || ''},${d.mood || ''},${d.energy || ''}`).join('\n'));
        break;
      }
      case 'emotions': {
        const data = db.prepare("SELECT * FROM emotion_logs WHERE user_id = ? ORDER BY log_date DESC").all(user.id);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=emotions.csv');
        res.send('日期,情绪分数,情绪标签,精力,笔记\n' + data.map(d => `${d.log_date},${d.mood_score},${d.mood_text},${d.energy},"${(d.note || '').replace(/"/g, '""')}"`).join('\n'));
        break;
      }
      case 'tasks': {
        const data = db.prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=tasks.csv');
        res.send('日期,标题,维度,难度,状态,经验,金币\n' + data.map(d => `${d.scheduled_date || ''},${d.title},${d.dimension_id},${d.difficulty},${d.status},${d.exp_reward},${d.coin_reward}`).join('\n'));
        break;
      }
      case 'narrative': {
        const data = db.prepare("SELECT * FROM life_narrative WHERE user_id = ? ORDER BY chapter_number").all(user.id);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=lifestory.txt');
        res.send(data.map(d => `第${d.chapter_number}章：${d.chapter_title}\n\n${d.narrative_text}\n\n---\n\n`).join(''));
        break;
      }
      default:
        res.status(400).json({ error: '未知类型' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 人生仪表盘 =====
router.get('/dashboard', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id, username, level, exp, coins, total_exp, consecutive_sign_days, last_sign_date, stat_health, stat_finance, stat_learning, stat_career, stat_social, stat_mental, stat_habits, stat_creativity, personality_type, personality_prompt FROM users LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];
    
    // 属性
    const stats = { health: user.stat_health, finance: user.stat_finance, learning: user.stat_learning, career: user.stat_career, social: user.stat_social, mental: user.stat_mental, habits: user.stat_habits, creativity: user.stat_creativity };
    const totalPower = Object.values(stats).reduce((a, b) => a + b, 0);
    const weakest = Object.entries(stats).sort(([,a],[,b]) => a - b)[0];
    const strongest = Object.entries(stats).sort(([,a],[,b]) => b - a)[0];
    
    // 今日
    const todayTasks = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed FROM tasks WHERE user_id = ? AND scheduled_date = ?").get(user.id, today);
    const todayCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(user.id, today);
    
    // 本周
    const weekStart = new Date(new Date() - new Date().getDay() * 86400000).toISOString().split('T')[0];
    const weekTasks = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed FROM tasks WHERE user_id = ? AND scheduled_date BETWEEN ? AND ?").get(user.id, weekStart, today);
    
    // 习惯
    const habits = db.prepare("SELECT h.name, h.icon, (SELECT COUNT(*) FROM habit_logs hl WHERE hl.habit_id = h.id AND date(hl.logged_at) = date('now')) as today_count, h.current_streak FROM habits h WHERE h.user_id = ? AND h.is_active = 1").all(user.id);
    
    // 最近成就
    const recentAch = db.prepare("SELECT a.name, a.icon, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON ua.achievement_id = a.id WHERE ua.user_id = ? ORDER BY ua.unlocked_at DESC LIMIT 3").all(user.id);
    
    // 成就总数
    const achCount = db.prepare("SELECT COUNT(*) as c FROM user_achievements WHERE user_id = ?").get(user.id);
    const totalAch = db.prepare("SELECT COUNT(*) as c FROM achievements").get();
    
    res.json({
      user: { level: user.level, exp: user.exp, coins: user.coins, streak: user.consecutive_sign_days },
      stats, totalPower, weakest: { dim: weakest[0], val: weakest[1] }, strongest: { dim: strongest[0], val: strongest[1] },
      today: { tasks: todayTasks, checkins: todayCheckins.c },
      week: { tasks: weekTasks, completionRate: weekTasks.total > 0 ? Math.round(weekTasks.completed / weekTasks.total * 100) : 0 },
      habits,
      achievements: { unlocked: achCount.c, total: totalAch.c, recent: recentAch }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 搜索 =====
router.get('/search', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { q } = req.query;
    if (!q) return res.json({ results: [] });
    
    const like = `%${q}%`;
    
    const chatResults = db.prepare("SELECT 'chat' as type, content, created_at FROM chat_history WHERE user_id = ? AND content LIKE ? ORDER BY created_at DESC LIMIT 5").all(user.id, like);
    const taskResults = db.prepare("SELECT 'task' as type, title as content, created_at FROM tasks WHERE user_id = ? AND title LIKE ? ORDER BY created_at DESC LIMIT 5").all(user.id, like);
    const memoryResults = db.prepare("SELECT 'memory' as type, title as content, created_at FROM ai_memory WHERE user_id = ? AND (title LIKE ? OR content LIKE ?) ORDER BY created_at DESC LIMIT 5").all(user.id, like, like);
    const goalResults = db.prepare("SELECT 'goal' as type, title as content, created_at FROM goals WHERE user_id = ? AND title LIKE ? ORDER BY created_at DESC LIMIT 5").all(user.id, like);
    
    const results = [...chatResults, ...taskResults, ...memoryResults, ...goalResults]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 15);
    
    res.json({ results, query: q });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
