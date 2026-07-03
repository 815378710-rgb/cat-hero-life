import { Router } from 'express';

const router = Router();

// Get current user profile
router.get('/profile', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const expForNext = getExpForLevel(user.level + 1);
    const expForCurrent = getExpForLevel(user.level);
    const progress = (user.exp - expForCurrent) / (expForNext - expForCurrent) * 100;
    const achCount = db.prepare('SELECT COUNT(*) as c FROM user_achievements WHERE user_id = ?').get(user.id);
    
    res.json({
      ...user,
      exp_progress: Math.round(progress),
      exp_for_next: expForNext,
      achievement_count: achCount.c
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update user profile
router.put('/profile', (req, res) => {
  const db = req.db;
  try {
    const { username, personality_type, personality_prompt, monthly_income, monthly_budget, reward_pool_percent } = req.body;
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    
    db.prepare(`
      UPDATE users SET 
        username = COALESCE(?, username),
        personality_type = COALESCE(?, personality_type),
        personality_prompt = COALESCE(?, personality_prompt),
        monthly_income = COALESCE(?, monthly_income),
        monthly_budget = COALESCE(?, monthly_budget),
        reward_pool_percent = COALESCE(?, reward_pool_percent),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(username, personality_type, personality_prompt, monthly_income, monthly_budget, reward_pool_percent, user.id);
    
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get user stats
router.get('/stats', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const stats = {
      health: user.stat_health, finance: user.stat_finance,
      learning: user.stat_learning, career: user.stat_career,
      social: user.stat_social, mental: user.stat_mental,
      habits: user.stat_habits, creativity: user.stat_creativity
    };
    const totalPoints = Object.values(stats).reduce((a, b) => a + b, 0);
    res.json({ stats, total: totalPoints, average: Math.round(totalPoints / 8), level: user.level });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Daily sign-in
router.post('/signin', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];
    
    if (user.last_sign_date === today) {
      return res.json({ success: false, message: '今天已经签到过了喵~' });
    }
    
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const isConsecutive = user.last_sign_date === yesterday;
    const newStreak = isConsecutive ? user.consecutive_sign_days + 1 : 1;
    
    const baseExp = 20, baseCoins = 10;
    const streakBonus = Math.min(newStreak * 2, 50);
    const totalExp = baseExp + streakBonus;
    const totalCoins = baseCoins + Math.floor(streakBonus / 2);
    
    const { newLevel, newExp } = addExp(user, totalExp);
    
    db.prepare(`
      UPDATE users SET last_sign_date = ?, consecutive_sign_days = ?, 
        level = ?, exp = ?, total_exp = total_exp + ?, coins = coins + ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(today, newStreak, newLevel, newExp, totalExp, totalCoins, user.id);
    
    res.json({
      success: true,
      message: `签到成功喵！连续${newStreak}天 +${totalExp}经验 +${totalCoins}金币 🎉`,
      exp: totalExp, coins: totalCoins, streak: newStreak,
      level_up: newLevel > user.level
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function getExpForLevel(level) { return Math.floor(100 * Math.pow(1.15, level - 1)); }
function addExp(user, exp) {
  let newExp = user.exp + exp, newLevel = user.level;
  while (newExp >= getExpForLevel(newLevel + 1)) { newExp -= getExpForLevel(newLevel + 1); newLevel++; }
  return { newLevel, newExp };
}

export default router;
