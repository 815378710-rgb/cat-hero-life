import { Router } from 'express';
import { v4 as uuid } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { status, dimension_id } = req.query;
    let sql = `SELECT g.*, ld.name as dimension_name, ld.icon as dimension_icon, ld.color as dimension_color,
      (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id AND t.status = 'completed') as tasks_done,
      (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id) as tasks_total
      FROM goals g LEFT JOIN life_dimensions ld ON g.dimension_id = ld.id WHERE g.user_id = ?`;
    const params = [user.id];
    if (status) { sql += ' AND g.status = ?'; params.push(status); }
    if (dimension_id) { sql += ' AND g.dimension_id = ?'; params.push(dimension_id); }
    sql += ' ORDER BY g.priority DESC, g.created_at DESC';
    res.json({ goals: db.prepare(sql).all(...params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { title, description, dimension_id, target_value, unit, deadline, priority } = req.body;
    const id = uuid();
    db.prepare(`INSERT INTO goals (id, user_id, dimension_id, title, description, target_value, unit, deadline, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, user.id, dimension_id, title, description || null, target_value || null, unit || null, deadline || null, priority || 'medium');
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/progress', (req, res) => {
  const db = req.db;
  try {
    const { current_value } = req.body;
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
    if (!goal) return res.status(404).json({ error: '目标不存在' });
    const isComplete = goal.target_value && current_value >= goal.target_value;
    db.prepare(`UPDATE goals SET current_value = ?, status = ?, completed_at = ? WHERE id = ?`)
      .run(current_value, isComplete ? 'completed' : 'active', isComplete ? new Date().toISOString() : null, goal.id);
    if (isComplete) {
      const user = db.prepare('SELECT * FROM users LIMIT 1').get();
      const expReward = 100, coinReward = 50;
      const getExpForLevel = (l) => Math.floor(100 * Math.pow(1.15, l - 1));
      let newExp = user.exp + expReward, newLevel = user.level;
      while (newExp >= getExpForLevel(newLevel + 1)) { newExp -= getExpForLevel(newLevel + 1); newLevel++; }
      db.prepare('UPDATE users SET level = ?, exp = ?, coins = coins + ?, total_exp = total_exp + ? WHERE id = ?').run(newLevel, newExp, coinReward, expReward, user.id);
      return res.json({ success: true, completed: true, exp: expReward, coins: coinReward, message: '🎉 目标达成！太棒了喵！' });
    }
    res.json({ success: true, completed: false });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', (req, res) => {
  const db = req.db;
  try { db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
