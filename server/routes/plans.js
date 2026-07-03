import { Router } from 'express';
import { v4 as uuid } from 'uuid';

const router = Router();

// 获取人生规划
router.get('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { plan_type, dimension_id, status } = req.query;
    
    let sql = `SELECT lp.*, ld.name as dimension_name, ld.icon as dimension_icon FROM life_plans lp LEFT JOIN life_dimensions ld ON lp.dimension_id = ld.id WHERE lp.user_id = ?`;
    const params = [user.id];
    
    if (plan_type) { sql += ' AND lp.plan_type = ?'; params.push(plan_type); }
    if (dimension_id) { sql += ' AND lp.dimension_id = ?'; params.push(dimension_id); }
    if (status) { sql += ' AND lp.status = ?'; params.push(status); }
    else { sql += " AND lp.status = 'active'"; }
    
    sql += ' ORDER BY lp.plan_type, lp.created_at DESC';
    const plans = db.prepare(sql).all(...params);
    
    // 解析JSON字段
    const parsed = plans.map(p => ({
      ...p,
      key_results: tryParse(p.key_results, []),
      milestones: tryParse(p.milestones, []),
    }));
    
    res.json({ plans: parsed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取人生全景
router.get('/panorama', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT id, user_id, gender, birth_year, city, current_job, industry, job_years, education_level, school, major, mbti, marital_status, living_situation, height_cm, weight_kg, sleep_hours_avg, exercise_frequency, annual_income_range, monthly_fixed_expense, total_savings, total_debt, personality_traits, strengths, weaknesses, hobbies, skills, want_to_learn, current_challenges, ideal_life_description, ideal_self_description, bucket_list, onboarding_completed FROM life_profile WHERE user_id = ?').get(user.id);
    
    // 各维度规划
    const plans = db.prepare(`SELECT lp.*, ld.name as dimension_name, ld.icon as dimension_icon 
      FROM life_plans lp LEFT JOIN life_dimensions ld ON lp.dimension_id = ld.id 
      WHERE lp.user_id = ? AND lp.status = 'active' ORDER BY lp.plan_type`).all(user.id);
    
    // 最近的记忆
    const recentMemories = db.prepare(`SELECT * FROM ai_memory WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`).all(user.id);
    
    // 最近的叙事
    const recentNarrative = db.prepare(`SELECT * FROM life_narrative WHERE user_id = ? ORDER BY chapter_number DESC LIMIT 3`).all(user.id);
    
    // 成就统计
    const achCount = db.prepare('SELECT COUNT(*) as c FROM user_achievements WHERE user_id = ?').get(user.id);
    const totalAch = db.prepare('SELECT COUNT(*) as c FROM achievements').get();
    
    // 签到统计
    const totalCheckins = db.prepare('SELECT COUNT(*) as c FROM check_ins WHERE user_id = ?').get(user.id);
    const totalTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'completed'").get(user.id);
    
    res.json({
      user: {
        level: user.level, exp: user.exp, coins: user.coins,
        streak: user.consecutive_sign_days, total_exp: user.total_exp
      },
      profile: profile ? {
        gender: profile.gender, age: profile.birth_year ? new Date().getFullYear() - profile.birth_year : null,
        city: profile.city, job: profile.current_job, mbti: profile.mbti,
        onboarding_completed: profile.onboarding_completed
      } : null,
      stats: {
        health: user.stat_health, finance: user.stat_finance, learning: user.stat_learning,
        career: user.stat_career, social: user.stat_social, mental: user.stat_mental,
        habits: user.stat_habits, creativity: user.stat_creativity
      },
      plans: plans.map(p => ({ ...p, key_results: tryParse(p.key_results), milestones: tryParse(p.milestones) })),
      memories: recentMemories,
      narrative: recentNarrative,
      achievements: { unlocked: achCount.c, total: totalAch.c },
      totals: { checkins: totalCheckins.c, completed_tasks: totalTasks.c }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 更新规划进度
router.put('/:id/progress', (req, res) => {
  const db = req.db;
  try {
    const { progress, key_results, milestones } = req.body;
    const updates = [];
    const params = [];
    
    if (progress !== undefined) { updates.push('progress = ?'); params.push(progress); }
    if (key_results) { updates.push('key_results = ?'); params.push(JSON.stringify(key_results)); }
    if (milestones) { updates.push('milestones = ?'); params.push(JSON.stringify(milestones)); }
    
    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);
    
    db.prepare(`UPDATE life_plans SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function tryParse(json, fallback = null) {
  try { return JSON.parse(json); } catch { return fallback; }
}

export default router;
