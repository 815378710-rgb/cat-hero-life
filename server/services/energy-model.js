// 猫猫侠 能量模型 - 生物节律学习 + 能量预测
import { v4 as uuid } from 'uuid';

// 计算当前能量值
export function calculateCurrentEnergy(db, userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return 50;

  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const today = now.toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  // 基础分 (从历史基线)
  const baseline = db.prepare('SELECT baseline_energy FROM energy_profile WHERE user_id = ? AND day_of_week = ? AND hour = ?')
    .get(userId, dayOfWeek, hour);
  let energy = baseline ? baseline.baseline_energy : 50;

  // 睡眠影响 (最大权重)
  const lastSleep = db.prepare('SELECT duration_hours FROM health_sleep WHERE user_id = ? ORDER BY sleep_date DESC LIMIT 1').get(userId);
  if (lastSleep && lastSleep.duration_hours) {
    const sleepRatio = lastSleep.duration_hours / 7.5;
    energy += (sleepRatio - 1) * 30;
  }

  // 运动影响 (延迟正效应)
  const todayExercise = db.prepare("SELECT COUNT(*) as c FROM health_exercise WHERE user_id = ? AND exercise_date = ?").get(userId, today);
  const yesterdayExercise = db.prepare("SELECT COUNT(*) as c FROM health_exercise WHERE user_id = ? AND exercise_date = date('now', '-1 day')").get(userId);
  if (todayExercise.c > 0) energy += 10;
  if (yesterdayExercise.c > 0) energy += 5;

  // 情绪影响
  const latestMood = db.prepare('SELECT mood_score FROM mental_mood_diary WHERE user_id = ? ORDER BY diary_date DESC LIMIT 1').get(userId);
  if (latestMood && latestMood.mood_score) {
    energy += (latestMood.mood_score - 3) * 8;
  }

  // 签到活跃度
  energy += Math.min(user.consecutive_sign_days * 1.5, 15);

  // 时间衰减
  if (hour >= 14) energy -= (hour - 14) * 2;
  if (hour >= 21) energy -= 10;
  if (hour >= 0 && hour < 6) energy -= 15;

  // 最近完成任务数 (正反馈)
  const todayCompleted = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(userId, today);
  energy += Math.min(todayCompleted.c * 3, 12);

  energy = Math.max(0, Math.min(100, Math.round(energy)));

  // 记录能量日志
  db.prepare('INSERT INTO energy_log (id, user_id, log_date, hour, energy, source, context) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(uuid(), userId, today, hour, energy, 'inferred', JSON.stringify({
      sleep: lastSleep?.duration_hours, exercise: todayExercise.c,
      mood: latestMood?.mood_score, streak: user.consecutive_sign_days
    }));

  return energy;
}

// 获取能量等级
export function getEnergyLevel(energy) {
  if (energy >= 80) return { level: 'burst', label: '🔥 爆发期', color: '#FF6B6B', suggestion: '安排高难度/创造性任务', maxDifficulty: 'epic' };
  if (energy >= 60) return { level: 'high', label: '⚡ 高效期', color: '#4ECDC4', suggestion: '安排需要专注的任务', maxDifficulty: 'hard' };
  if (energy >= 40) return { level: 'normal', label: '🟡 平稳期', color: '#FFE66D', suggestion: '安排常规任务', maxDifficulty: 'medium' };
  if (energy >= 20) return { level: 'low', label: '🟠 低谷期', color: '#FF9800', suggestion: '只安排轻松任务', maxDifficulty: 'easy' };
  return { level: 'exhausted', label: '🔴 疲惫期', color: '#F44336', suggestion: '建议休息', maxDifficulty: 'none' };
}

// 学习用户能量基线
export function learnEnergyBaseline(db, userId) {
  const logs = db.prepare(`SELECT log_date, hour, energy FROM energy_log WHERE user_id = ? AND created_at >= datetime('now', '-30 days')`).all(userId);

  const buckets = {};
  for (const log of logs) {
    const dayOfWeek = new Date(log.log_date).getDay();
    const key = `${dayOfWeek}_${log.hour}`;
    if (!buckets[key]) buckets[key] = { sum: 0, count: 0, dayOfWeek };
    buckets[key].sum += log.energy;
    buckets[key].count++;
  }

  for (const [key, data] of Object.entries(buckets)) {
    const hour = parseInt(key.split('_')[1]);
    const dayOfWeek = data.dayOfWeek;
    const avg = Math.round(data.sum / data.count);
    db.prepare(`INSERT OR REPLACE INTO energy_profile (user_id, day_of_week, hour, baseline_energy, sample_count, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`)
      .run(userId, dayOfWeek, hour, avg, data.count);
  }
}

// 获取能量来源分解
export function getEnergyBreakdown(db, userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });

  const lastSleep = db.prepare('SELECT duration_hours, quality FROM health_sleep WHERE user_id = ? ORDER BY sleep_date DESC LIMIT 1').get(userId);
  const todayExercise = db.prepare("SELECT SUM(duration_minutes) as m FROM health_exercise WHERE user_id = ? AND exercise_date = ?").get(userId, today);
  const latestMood = db.prepare('SELECT mood_score FROM mental_mood_diary WHERE user_id = ? ORDER BY diary_date DESC LIMIT 1').get(userId);
  const todayCompleted = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(userId, today);

  return {
    sleep: { value: lastSleep?.duration_hours || 0, impact: lastSleep ? Math.round((lastSleep.duration_hours / 7.5 - 1) * 30) : 0, label: '睡眠' },
    exercise: { value: todayExercise?.m || 0, impact: todayExercise?.m > 0 ? 10 : 0, label: '运动' },
    mood: { value: latestMood?.mood_score || 3, impact: latestMood ? Math.round((latestMood.mood_score - 3) * 8) : 0, label: '情绪' },
    streak: { value: user.consecutive_sign_days, impact: Math.round(Math.min(user.consecutive_sign_days * 1.5, 15)), label: '连续签到' },
    tasks: { value: todayCompleted.c, impact: Math.min(todayCompleted.c * 3, 12), label: '完成任务' }
  };
}

// 预测今日能量曲线
export function predictEnergyCurve(db, userId) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const curve = [];

  for (let h = 0; h < 24; h++) {
    const baseline = db.prepare('SELECT baseline_energy FROM energy_profile WHERE user_id = ? AND day_of_week = ? AND hour = ?')
      .get(userId, dayOfWeek, h);
    curve.push({ hour: h, energy: baseline ? baseline.baseline_energy : 50 });
  }

  return curve;
}
