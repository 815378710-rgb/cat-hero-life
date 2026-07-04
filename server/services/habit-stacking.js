// 猫猫侠 习惯嫁接 - 锚点发现、嫁接建议、成功率追踪
import { v4 as uuid } from 'uuid';

// 发现稳定锚点习惯
export function findAnchorHabits(db, userId) {
  const habits = db.prepare('SELECT * FROM habits WHERE user_id = ? AND is_active = 1').all(userId);
  const anchors = [];

  for (const habit of habits) {
    const logs = db.prepare(`SELECT date(logged_at) as d FROM habit_logs WHERE habit_id = ? AND logged_at >= datetime('now', '-30 days') GROUP BY date(logged_at) ORDER BY d`).all(habit.id);

    if (logs.length < 7) continue;

    // 计算最长连续天数
    let maxStreak = 1, currentStreak = 1;
    for (let i = 1; i < logs.length; i++) {
      const prev = new Date(logs[i - 1].d);
      const curr = new Date(logs[i].d);
      const diffDays = (curr - prev) / 86400000;
      if (diffDays === 1) { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak); }
      else currentStreak = 1;
    }

    const completionRate = logs.length / 30;
    if (maxStreak >= 7 && completionRate > 0.7) {
      anchors.push({
        ...habit,
        maxStreak,
        completionRate: Math.round(completionRate * 100),
        stability: Math.min(100, maxStreak * 3 + Math.round(completionRate * 50))
      });
    }
  }

  return anchors.sort((a, b) => b.stability - a.stability);
}

// 建议习惯嫁接
export function suggestHabitStack(db, userId, newHabitId) {
  const newHabit = db.prepare('SELECT * FROM habits WHERE id = ?').get(newHabitId);
  if (!newHabit) return null;

  const anchors = findAnchorHabits(db, userId);
  if (anchors.length === 0) return null;

  let bestAnchor = null;
  let bestScore = 0;

  for (const anchor of anchors) {
    let score = 0;

    // 维度相关性
    if (newHabit.dimension_id === anchor.dimension_id) score += 20;

    // 稳定性
    score += Math.min(anchor.stability, 40);

    // 习惯名称语义相近 (简单关键词匹配)
    const newWords = newHabit.name.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    const anchorWords = anchor.name.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    const overlap = newWords.filter(w => anchorWords.includes(w)).length;
    score += overlap * 10;

    if (score > bestScore) {
      bestScore = score;
      bestAnchor = anchor;
    }
  }

  if (!bestAnchor) return null;

  return {
    anchor: { id: bestAnchor.id, name: bestAnchor.name, streak: bestAnchor.maxStreak, stability: bestAnchor.stability },
    suggestion: `在「${bestAnchor.name}」之后，紧接着做「${newHabit.name}」`,
    moment: 'after',
    cueDescription: `完成${bestAnchor.name}后，立刻开始${newHabit.name}`,
    expectedSuccessRate: Math.min(80, Math.round(bestAnchor.stability * 0.7))
  };
}

// 创建嫁接
export function createHabitStack(db, userId, newHabitId, anchorHabitId, moment = 'after') {
  const anchor = db.prepare('SELECT * FROM habits WHERE id = ?').get(anchorHabitId);
  const newHabit = db.prepare('SELECT * FROM habits WHERE id = ?').get(newHabitId);
  if (!anchor || !newHabit) return null;

  const id = uuid();
  db.prepare('INSERT INTO habit_stacking (id, user_id, new_habit_id, anchor_habit_id, anchor_moment, cue_description) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, userId, newHabitId, anchorHabitId, moment, `完成${anchor.name}后，立刻开始${newHabit.name}`);

  return id;
}

// 记录嫁接结果
export function recordStackResult(db, stackId, success) {
  if (success) {
    db.prepare('UPDATE habit_stacking SET success_count = success_count + 1, streak = streak + 1, status = CASE WHEN streak >= 20 THEN "graduated" ELSE "active" END WHERE id = ?').run(stackId);
  } else {
    db.prepare('UPDATE habit_stacking SET fail_count = fail_count + 1, streak = 0 WHERE id = ?').run(stackId);
  }
}

// 获取用户的嫁接列表
export function getUserStacks(db, userId) {
  return db.prepare(`
    SELECT hs.*, 
      h1.name as anchor_name, h1.icon as anchor_icon,
      h2.name as new_habit_name, h2.icon as new_habit_icon
    FROM habit_stacking hs
    JOIN habits h1 ON hs.anchor_habit_id = h1.id
    JOIN habits h2 ON hs.new_habit_id = h2.id
    WHERE hs.user_id = ? AND hs.status = 'active'
    ORDER BY hs.created_at DESC
  `).all(userId);
}
