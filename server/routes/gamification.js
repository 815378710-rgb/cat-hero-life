import { Router } from 'express';
import { v4 as uuid } from 'uuid';

const router = Router();

router.get('/level', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const getExpForLevel = (l) => Math.floor(100 * Math.pow(1.15, l - 1));
    const expForNext = getExpForLevel(user.level + 1);
    const progress = (user.exp / expForNext * 100).toFixed(1);
    res.json({ level: user.level, exp: user.exp, exp_for_next: expForNext, exp_progress: parseFloat(progress), total_exp: user.total_exp, coins: user.coins });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/achievements', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const all = db.prepare('SELECT * FROM achievements ORDER BY rarity, created_at').all();
    const unlocked = db.prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?').all(user.id);
    const unlockedIds = new Set(unlocked.map(a => a.achievement_id));
    const result = all.map(a => ({ ...a, unlocked: unlockedIds.has(a.id) }));
    res.json({ achievements: result, total: all.length, unlocked: unlockedIds.size, progress: ((unlockedIds.size / all.length) * 100).toFixed(1) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/check-achievements', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const newlyUnlocked = [];
    const achievements = db.prepare(`SELECT a.* FROM achievements a WHERE a.id NOT IN (SELECT achievement_id FROM user_achievements WHERE user_id = ?)`).all(user.id);
    const totalTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'completed'").get(user.id);
    
    for (const ach of achievements) {
      let earned = false;
      switch (ach.condition_type) {
        case 'streak': earned = user.consecutive_sign_days >= ach.condition_value; break;
        case 'level': earned = user.level >= ach.condition_value; break;
        case 'total': earned = totalTasks.c >= ach.condition_value; break;
        case 'first':
          if (ach.category) {
            const dimCheckins = db.prepare('SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND dimension_id = ?').get(user.id, ach.category);
            earned = dimCheckins.c >= 1;
          }
          break;
      }
      if (earned) {
        db.prepare('INSERT INTO user_achievements (id, user_id, achievement_id) VALUES (?, ?, ?)').run(uuid(), user.id, ach.id);
        db.prepare('UPDATE users SET exp = exp + ?, coins = coins + ?, total_exp = total_exp + ? WHERE id = ?').run(ach.exp_reward, ach.coin_reward, ach.exp_reward, user.id);
        newlyUnlocked.push(ach);
      }
    }
    res.json({ success: true, new_achievements: newlyUnlocked, message: newlyUnlocked.length > 0 ? `🎉 解锁了${newlyUnlocked.length}个新成就喵！` : '暂时没有新成就解锁，继续加油喵~' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/radar', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const dimensions = db.prepare('SELECT * FROM life_dimensions ORDER BY sort_order').all();
    const radar = dimensions.map(d => ({ dimension: d.id, name: d.name, icon: d.icon, color: d.color, value: user[`stat_${d.id}`] || 0 }));
    res.json({ radar, total_power: radar.reduce((s, r) => s + r.value, 0) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/streak', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT consecutive_sign_days, last_sign_date FROM users LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];
    res.json({ streak: user.consecutive_sign_days, signed_today: user.last_sign_date === today, last_sign: user.last_sign_date });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
