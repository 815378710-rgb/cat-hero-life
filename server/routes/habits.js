import { Router } from 'express';
import { v4 as uuid } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const habits = db.prepare(`
      SELECT h.*, ld.name as dimension_name, ld.icon as dimension_icon,
        (SELECT COUNT(*) FROM habit_logs hl WHERE hl.habit_id = h.id) as total_logs,
        (SELECT COUNT(*) FROM habit_logs hl WHERE hl.habit_id = h.id AND date(hl.logged_at) = date('now')) as today_count
      FROM habits h LEFT JOIN life_dimensions ld ON h.dimension_id = ld.id
      WHERE h.user_id = ? AND h.is_active = 1 ORDER BY h.created_at DESC
    `).all(user.id);
    res.json({ habits });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { name, description, dimension_id, frequency, target_count, icon } = req.body;
    const id = uuid();
    db.prepare(`INSERT INTO habits (id, user_id, dimension_id, name, description, frequency, target_count, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, user.id, dimension_id, name, description || null, frequency || 'daily', target_count || 1, icon || '🎯');
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/log', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const habit = db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ?').get(req.params.id, user.id);
    if (!habit) return res.status(404).json({ error: '习惯不存在' });
    
    db.prepare('INSERT INTO habit_logs (id, habit_id, user_id, count) VALUES (?, ?, ?, ?)').run(uuid(), habit.id, user.id, req.body.count || 1);
    
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const todayLogs = db.prepare('SELECT COUNT(*) as c FROM habit_logs WHERE habit_id = ? AND date(logged_at) = ?').get(habit.id, today);
    const yesterdayLogs = db.prepare('SELECT COUNT(*) as c FROM habit_logs WHERE habit_id = ? AND date(logged_at) = ?').get(habit.id, yesterday);
    
    let newStreak = habit.current_streak;
    if (todayLogs.c >= 1) {
      // 只要有打卡就计算连续天数
      if (yesterdayLogs.c >= 1) {
        newStreak = habit.current_streak + 1;
      } else {
        // 检查是不是第一天打卡
        const anyPreviousLogs = db.prepare('SELECT COUNT(*) as c FROM habit_logs WHERE habit_id = ? AND date(logged_at) < ?').get(habit.id, today);
        newStreak = anyPreviousLogs.c > 0 ? 1 : 1; // 第一次或重新开始都是1
      }
    }
    const bestStreak = Math.max(habit.best_streak, newStreak);
    db.prepare('UPDATE habits SET current_streak = ?, best_streak = ? WHERE id = ?').run(newStreak, bestStreak, habit.id);
    
    const expReward = 5;
    const getExpForLevel = (l) => Math.floor(100 * Math.pow(1.15, l - 1));
    let newExp = user.exp + expReward, newLevel = user.level;
    while (newExp >= getExpForLevel(newLevel + 1)) { newExp -= getExpForLevel(newLevel + 1); newLevel++; }
    db.prepare('UPDATE users SET level = ?, exp = ?, total_exp = total_exp + ? WHERE id = ?').run(newLevel, newExp, expReward, user.id);
    
    res.json({ success: true, streak: newStreak, best_streak: bestStreak, exp: expReward, message: `习惯打卡成功喵！连续${newStreak}天 🔥` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', (req, res) => {
  const db = req.db;
  try { db.prepare('UPDATE habits SET is_active = 0 WHERE id = ?').run(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/seed', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const defaults = [
      { name: '喝水', dimension: 'health', icon: '💧', desc: '每天喝够8杯水', target: 8 },
      { name: '运动', dimension: 'health', icon: '🏃', desc: '运动30分钟以上', target: 1 },
      { name: '早起', dimension: 'habits', icon: '⏰', desc: '7点前起床', target: 1 },
      { name: '阅读', dimension: 'learning', icon: '📖', desc: '阅读30分钟', target: 1 },
      { name: '记账', dimension: 'finance', icon: '📝', desc: '记录今日支出', target: 1 },
      { name: '冥想', dimension: 'mental', icon: '🧘', desc: '冥想10分钟', target: 1 },
    ];
    for (const h of defaults) {
      const exists = db.prepare('SELECT id FROM habits WHERE user_id = ? AND name = ?').get(user.id, h.name);
      if (!exists) {
        db.prepare('INSERT INTO habits (id, user_id, dimension_id, name, description, icon, target_count) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(uuid(), user.id, h.dimension, h.name, h.desc, h.icon, h.target);
      }
    }
    res.json({ success: true, count: defaults.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
