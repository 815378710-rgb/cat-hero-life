import { Router } from 'express';
import { v4 as uuid } from 'uuid';

const router = Router();

// 排行榜
router.get('/leaderboard', (req, res) => {
  const db = req.db;
  try {
    const { type = 'level', limit = 20 } = req.query;
    const limitNum = parseInt(limit) || 20;

    let users;
    if (type === 'streak') {
      users = db.prepare('SELECT id, username, level, consecutive_sign_days as value, avatar_url FROM users WHERE consecutive_sign_days > 0 ORDER BY consecutive_sign_days DESC LIMIT ?').all(limitNum);
    } else if (type === 'coins') {
      users = db.prepare('SELECT id, username, level, coins as value, avatar_url FROM users ORDER BY coins DESC LIMIT ?').all(limitNum);
    } else if (type === 'weekly') {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      users = db.prepare(`
        SELECT u.id, u.username, u.level, u.avatar_url, COUNT(*) as value
        FROM users u JOIN check_ins c ON u.id = c.user_id
        WHERE c.checked_at >= ?
        GROUP BY u.id
        ORDER BY value DESC LIMIT ?
      `).all(weekAgo, limitNum);
    } else {
      // 综合战力排行（8维属性总分）
      users = db.prepare(`
        SELECT id, username, level, 
          (stat_health + stat_finance + stat_learning + stat_career + stat_social + stat_mental + stat_habits + stat_creativity) as value,
          avatar_url
        FROM users ORDER BY value DESC LIMIT ?
      `).all(limitNum);
    }

    res.json({ leaderboard: users, type });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 生成分享海报数据
router.get('/share-card', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    if (!user) return res.status(404).json({ error: '用户未找到' });

    const today = new Date().toISOString().split('T')[0];
    const totalCheckins = db.prepare('SELECT COUNT(*) as c FROM check_ins WHERE user_id = ?').get(user.id);
    const todayCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(user.id, today);
    const completedTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'completed'").get(user.id);
    const achievements = db.prepare('SELECT name, icon, description FROM achievements WHERE user_id = ? AND is_unlocked = 1 ORDER BY unlocked_at DESC LIMIT 3').all(user.id);
    const topHabit = db.prepare('SELECT name, current_streak FROM habits WHERE user_id = ? AND is_active = 1 ORDER BY current_streak DESC LIMIT 1').get(user.id);

    const card = {
      username: user.username,
      level: user.level,
      title: getTitleByLevel(user.level),
      stats: {
        totalCheckins: totalCheckins.c,
        todayCheckins: todayCheckins.c,
        completedTasks: completedTasks.c,
        streak: user.consecutive_sign_days,
        coins: user.coins
      },
      dimensions: {
        health: user.stat_health, finance: user.stat_finance, learning: user.stat_learning,
        career: user.stat_career, social: user.stat_social, mental: user.stat_mental,
        habits: user.stat_habits, creativity: user.stat_creativity
      },
      achievements: achievements.map(a => ({ name: a.name, icon: a.icon, desc: a.description })),
      topHabit: topHabit ? { name: topHabit.name, streak: topHabit.current_streak } : null
    };

    res.json(card);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function getTitleByLevel(level) {
  if (level >= 50) return '传奇猫侠';
  if (level >= 30) return '宗师猫侠';
  if (level >= 20) return '精英猫侠';
  if (level >= 10) return '高级猫侠';
  if (level >= 5) return '猫猫学徒';
  return '新手小猫';
}

export default router;
