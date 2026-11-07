import { Router } from 'express';
import { v4 as uuid } from 'uuid';

const router = Router();

router.get('/daily', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const reportDate = req.query.date || new Date().toISOString().split('T')[0];
    let report = db.prepare('SELECT * FROM daily_reports WHERE user_id = ? AND report_date = ?').get(user.id, reportDate);
    if (!report) report = generateDailyReport(db, user.id, reportDate);
    res.json({ report });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/weekly', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const today = new Date();
    const weekAgo = new Date(today - 7 * 86400000).toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];
    
    const taskStats = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed FROM tasks WHERE user_id = ? AND scheduled_date BETWEEN ? AND ?`).get(user.id, weekAgo, todayStr);
    const checkinStats = db.prepare(`SELECT date(checked_at) as day, COUNT(*) as count FROM check_ins WHERE user_id = ? AND checked_at BETWEEN ? AND ? GROUP BY date(checked_at) ORDER BY day`).all(user.id, weekAgo, todayStr);
    const dimensionStats = db.prepare(`SELECT dimension_id, COUNT(*) as count FROM check_ins WHERE user_id = ? AND checked_at BETWEEN ? AND ? GROUP BY dimension_id ORDER BY count DESC`).all(user.id, weekAgo, todayStr);
    
    const completionRate = taskStats.total > 0 ? ((taskStats.completed / taskStats.total) * 100).toFixed(1) : 0;
    const mostActiveDay = checkinStats.reduce((max, d) => d.count > (max?.count || 0) ? d : max, null);
    
    res.json({ period: { from: weekAgo, to: todayStr }, tasks: { ...taskStats, completion_rate: completionRate }, checkins: checkinStats, dimensions: dimensionStats, most_active_day: mostActiveDay, total_checkins: checkinStats.reduce((s, d) => s + d.count, 0) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function generateDailyReport(db, userId, date) {
  const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ? AND scheduled_date = ?').all(userId, date);
  const checkins = db.prepare('SELECT ci.*, ld.name as dimension_name FROM check_ins ci LEFT JOIN life_dimensions ld ON ci.dimension_id = ld.id WHERE ci.user_id = ? AND date(ci.checked_at) = ?').all(userId, date);
  const completed = tasks.filter(t => t.status === 'completed').length;
  const expGained = checkins.length * 5;
  const moodAvg = checkins.filter(c => c.mood).reduce((s, c, _, a) => s + c.mood / a.length, 0);
  
  const highlights = [];
  if (completed === tasks.length && tasks.length > 0) highlights.push('今日任务全部完成！🎉');
  if (checkins.length >= 5) highlights.push('高产的一天！💪');
  
  const suggestions = [];
  if (completed < tasks.length * 0.5) suggestions.push('明天试试从最简单的任务开始~');
  
  const report = { id: uuid(), user_id: userId, report_date: date, summary: `今天完成了${completed}/${tasks.length}个任务，打卡${checkins.length}次。`, tasks_completed: completed, tasks_total: tasks.length, exp_gained: expGained, coins_gained: Math.floor(expGained / 2), mood_avg: moodAvg || null, highlights: JSON.stringify(highlights), suggestions: JSON.stringify(suggestions) };
  
  db.prepare(`INSERT OR REPLACE INTO daily_reports (id, user_id, report_date, summary, tasks_completed, tasks_total, exp_gained, coins_gained, mood_avg, highlights, suggestions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(report.id, userId, date, report.summary, completed, tasks.length, expGained, Math.floor(expGained / 2), moodAvg || null, report.highlights, report.suggestions);
  return report;
}

export default router;
