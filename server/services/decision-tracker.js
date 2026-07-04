// 猫猫侠 决策追踪闭环 - 记录决策、追踪结果、因果记忆
import { v4 as uuid } from 'uuid';

// 记录一个决策
export function recordDecision(db, userId, decisionText, affectedDim, eventSource = 'user_stated') {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  // 快照当前所有维度
  const snapshot = {
    health: user.stat_health, finance: user.stat_finance,
    learning: user.stat_learning, career: user.stat_career,
    social: user.stat_social, mental: user.stat_mental,
    habits: user.stat_habits, creativity: user.stat_creativity
  };

  const id = uuid();
  db.prepare('INSERT INTO decision_events (id, user_id, event_source, decision_text, dimension_affected, context) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, userId, eventSource, decisionText, affectedDim, JSON.stringify(snapshot));

  return id;
}

// 检查决策结果
export function checkDecisionOutcome(db, decisionId, checkType) {
  const decision = db.prepare('SELECT * FROM decision_events WHERE id = ?').get(decisionId);
  if (!decision) return null;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decision.user_id);
  if (!user) return null;

  const dimBefore = JSON.parse(decision.context);
  const dimAfter = {
    health: user.stat_health, finance: user.stat_finance,
    learning: user.stat_learning, career: user.stat_career,
    social: user.stat_social, mental: user.stat_mental,
    habits: user.stat_habits, creativity: user.stat_creativity
  };

  const delta = {};
  for (const dim of Object.keys(dimAfter)) {
    delta[dim] = dimAfter[dim] - (dimBefore[dim] || 50);
  }

  // 判断正负
  const mainDelta = delta[decision.dimension_affected] || 0;
  let verdict = 'neutral';
  if (mainDelta > 3) verdict = 'positive';
  else if (mainDelta < -3) verdict = 'negative';

  // 生成叙述
  const dimNames = { health: '健康', finance: '财务', learning: '学习', career: '职业', social: '社交', mental: '心理', habits: '习惯', creativity: '创造' };
  const dimName = dimNames[decision.dimension_affected] || '整体';
  let narrative = '';

  if (verdict === 'positive') {
    narrative = `你当初决定「${decision.decision_text}」是个好选择！${dimName}从${dimBefore[decision.dimension_affected]}涨到了${dimAfter[decision.dimension_affected]}。`;
  } else if (verdict === 'negative') {
    narrative = `你当初决定「${decision.decision_text}」后，${dimName}反而从${dimBefore[decision.dimension_affected]}降到了${dimAfter[decision.dimension_affected]}。要不要重新考虑？`;
  } else {
    narrative = `你当初决定「${decision.decision_text}」，目前${dimName}变化不大。坚持看看？`;
  }

  // 保存结果
  const outcomeId = uuid();
  db.prepare('INSERT INTO decision_outcomes (id, decision_id, check_type, dim_before, dim_after, delta, verdict, narrative) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(outcomeId, decisionId, checkType, JSON.stringify(dimBefore), JSON.stringify(dimAfter), JSON.stringify(delta), verdict, narrative);

  return { verdict, narrative, delta, dimBefore, dimAfter };
}

// 获取待检查的决策
export function getPendingChecks(db, userId) {
  const now = new Date();
  const results = [];

  // 3天前的决策
  const d3 = new Date(now - 3 * 86400000).toISOString();
  const decisions3d = db.prepare(`SELECT de.* FROM decision_events de 
    LEFT JOIN decision_outcomes do2 ON de.id = do2.decision_id AND do2.check_type = '3d'
    WHERE de.user_id = ? AND de.decided_at <= ? AND do2.id IS NULL`).all(userId, d3);
  for (const d of decisions3d) results.push({ ...d, checkType: '3d' });

  // 7天前的决策
  const d7 = new Date(now - 7 * 86400000).toISOString();
  const decisions7d = db.prepare(`SELECT de.* FROM decision_events de 
    LEFT JOIN decision_outcomes do2 ON de.id = do2.decision_id AND do2.check_type = '7d'
    WHERE de.user_id = ? AND de.decided_at <= ? AND do2.id IS NULL`).all(userId, d7);
  for (const d of decisions7d) results.push({ ...d, checkType: '7d' });

  // 30天前的决策
  const d30 = new Date(now - 30 * 86400000).toISOString();
  const decisions30d = db.prepare(`SELECT de.* FROM decision_events de 
    LEFT JOIN decision_outcomes do2 ON de.id = do2.decision_id AND do2.check_type = '30d'
    WHERE de.user_id = ? AND de.decided_at <= ? AND do2.id IS NULL`).all(userId, d30);
  for (const d of decisions30d) results.push({ ...d, checkType: '30d' });

  return results;
}

// 获取决策历史
export function getDecisionHistory(db, userId, limit = 20) {
  const decisions = db.prepare('SELECT * FROM decision_events WHERE user_id = ? ORDER BY decided_at DESC LIMIT ?').all(userId, limit);

  return decisions.map(d => {
    const outcomes = db.prepare('SELECT * FROM decision_outcomes WHERE decision_id = ? ORDER BY checked_at').all(d.id);
    return { ...d, context: undefined, outcomes };
  });
}
