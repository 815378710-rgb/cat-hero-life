// 猫猫侠 神经传播引擎 - 属性神经系统核心
// 维度间影响传播、反馈循环检测、权重学习

import { v4 as uuid } from 'uuid';

// 默认先验权重矩阵 (source → target)
const DEFAULT_WEIGHTS = {
  health:     { finance: 0.0, learning: 0.3, career: 0.2, social: 0.1, mental: 0.6, habits: 0.3, creativity: 0.1 },
  finance:    { health: 0.1, learning: 0.2, career: 0.4, social: 0.1, mental: 0.5, habits: 0.2, creativity: 0.0 },
  learning:   { health: 0.1, finance: 0.2, career: 0.5, social: 0.2, mental: 0.3, habits: 0.3, creativity: 0.4 },
  career:     { health: 0.0, finance: 0.5, learning: 0.3, social: 0.3, mental: 0.3, habits: 0.2, creativity: 0.1 },
  social:     { health: 0.1, finance: 0.0, learning: 0.2, career: 0.3, mental: 0.5, habits: 0.1, creativity: 0.2 },
  mental:     { health: 0.4, finance: 0.2, learning: 0.4, career: 0.3, social: 0.4, habits: 0.5, creativity: 0.3 },
  habits:     { health: 0.3, finance: 0.2, learning: 0.3, career: 0.2, social: 0.1, mental: 0.4, creativity: 0.2 },
  creativity: { health: 0.1, finance: 0.1, learning: 0.3, career: 0.2, social: 0.3, mental: 0.3, habits: 0.2 }
};

const DECAY_FACTOR = 0.6;    // 每层传播衰减
const MIN_SIGNAL = 0.5;      // 最小信号阈值
const MAX_DEPTH = 2;          // 最大传播深度
const ALL_DIMS = ['health', 'finance', 'learning', 'career', 'social', 'mental', 'habits', 'creativity'];

// 初始化权重矩阵到数据库
export function initInfluenceMatrix(db) {
  for (const [source, targets] of Object.entries(DEFAULT_WEIGHTS)) {
    for (const [target, weight] of Object.entries(targets)) {
      try {
        db.prepare(`INSERT OR IGNORE INTO dimension_influence (source_dim, target_dim, weight, learned_from) VALUES (?, ?, ?, 'default')`)
          .run(source, target, weight);
      } catch {}
    }
  }
}

// 获取权重矩阵
export function getInfluenceMatrix(db) {
  const rows = db.prepare('SELECT * FROM dimension_influence').all();
  const matrix = {};
  for (const dim of ALL_DIMS) {
    matrix[dim] = {};
  }
  for (const row of rows) {
    matrix[row.source_dim][row.target_dim] = row.weight;
  }
  return matrix;
}

// 更新单个权重
export function updateWeight(db, source, target, newWeight, learnedFrom = 'model') {
  db.prepare(`UPDATE dimension_influence SET weight = ?, learned_from = ?, updated_at = datetime('now') WHERE source_dim = ? AND target_dim = ?`)
    .run(Math.max(0, Math.min(1, newWeight)), learnedFrom, source, target);
}

// ===== 核心传播算法 =====
export function propagate(db, userId, sourceDim, delta) {
  const queue = [{ dim: sourceDim, signal: delta, depth: 0, source: null }];
  const visited = new Set();
  const changes = [];

  while (queue.length > 0) {
    const { dim, signal, depth, source } = queue.shift();

    // 终止条件
    if (depth > MAX_DEPTH) continue;
    if (Math.abs(signal) < MIN_SIGNAL) continue;
    if (visited.has(dim)) continue;
    visited.add(dim);

    // 应用变化 (clamp 0-100)
    const currentValue = getUserDimValue(db, userId, dim);
    const newValue = Math.max(0, Math.min(100, Math.round(currentValue + signal)));
    if (newValue !== currentValue) {
      setUserDimValue(db, userId, dim, newValue);
      changes.push({ dim, from: currentValue, to: newValue, delta: Math.round(signal * 10) / 10, depth, source });
    }

    // 向下游传播
    const weights = getOutgoingWeights(db, dim);
    for (const [target, weight] of Object.entries(weights)) {
      if (target === source) continue; // 不回传
      const newSignal = signal * weight * DECAY_FACTOR;
      if (Math.abs(newSignal) >= MIN_SIGNAL) {
        queue.push({ dim: target, signal: newSignal, depth: depth + 1, source: dim });
      }
    }
  }

  // 记录传播日志
  if (changes.length > 0) {
    const logId = uuid();
    db.prepare(`INSERT INTO propagation_log (id, user_id, trigger_dim, trigger_delta, steps, total_affected) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(logId, userId, sourceDim, delta, JSON.stringify(changes), changes.length);
  }

  return changes;
}

// ===== 反馈循环检测 =====
export function detectFeedbackCycles(db, userId) {
  // 分析最近30天的传播日志，检测正/负循环
  const logs = db.prepare(`SELECT * FROM propagation_log WHERE user_id = ? AND created_at >= datetime('now', '-30 days') ORDER BY created_at DESC`).all(userId);

  const cycles = [];
  const dimSequences = {};

  for (const log of logs) {
    try {
      const steps = JSON.parse(log.steps);
      // 提取传播路径
      const path = steps.map(s => s.dim);
      const key = path.join('→');

      if (!dimSequences[key]) dimSequences[key] = { count: 0, firstSeen: log.created_at };
      dimSequences[key].count++;
    } catch {}
  }

  // 检测重复出现的传播模式
  for (const [path, info] of Object.entries(dimSequences)) {
    if (info.count >= 3) {
      const dims = path.split('→');
      // 判断是正循环还是负循环
      const recentLog = logs.find(l => {
        try { return JSON.parse(l.steps).map(s => s.dim).join('→') === path; } catch { return false; }
      });
      if (recentLog) {
        const steps = JSON.parse(recentLog.steps);
        const totalDelta = steps.reduce((sum, s) => sum + s.delta, 0);
        cycles.push({
          path: dims,
          count: info.count,
          type: totalDelta > 0 ? 'positive' : 'negative',
          totalDelta: Math.round(totalDelta * 10) / 10,
          description: totalDelta > 0
            ? `正向循环：${dims.join(' → ')} 形成了良性循环（出现${info.count}次）`
            : `恶性循环预警：${dims.join(' → ')} 在持续恶化（出现${info.count}次）`
        });
      }
    }
  }

  return cycles;
}

// ===== 从用户数据学习权重 =====
export function learnWeightsFromData(db, userId) {
  // 获取最近60天的属性变化历史
  const snapshots = db.prepare(`SELECT * FROM balance_snapshots WHERE user_id = ? ORDER BY snapshot_date DESC LIMIT 60`).all(userId);

  if (snapshots.length < 7) return; // 数据不足

  // 计算各维度变化的相关性
  const dimChanges = {};
  for (const dim of ALL_DIMS) dimChanges[dim] = [];

  for (let i = 0; i < snapshots.length - 1; i++) {
    const current = JSON.parse(snapshots[i].dim_values);
    const previous = JSON.parse(snapshots[i + 1].dim_values);
    for (const dim of ALL_DIMS) {
      dimChanges[dim].push((current[dim] || 50) - (previous[dim] || 50));
    }
  }

  // 计算相关系数 (简化版Pearson)
  for (const source of ALL_DIMS) {
    for (const target of ALL_DIMS) {
      if (source === target) continue;
      const correlation = pearsonCorrelation(dimChanges[source], dimChanges[target]);

      // 只有显著相关才更新 (|r| > 0.3)
      if (Math.abs(correlation) > 0.3) {
        const newWeight = Math.abs(correlation) * 0.8; // 缩放到合理范围
        const currentWeight = getWeight(db, source, target);
        // 平滑更新 (70%旧 + 30%新)
        const smoothed = currentWeight * 0.7 + newWeight * 0.3;
        updateWeight(db, source, target, smoothed, 'model');
      }
    }
  }
}

// ===== 辅助函数 =====

function getUserDimValue(db, userId, dim) {
  const user = db.prepare(`SELECT stat_${dim} as val FROM users WHERE id = ?`).get(userId);
  return user ? user.val : 50;
}

function setUserDimValue(db, userId, dim, value) {
  db.prepare(`UPDATE users SET stat_${dim} = ?, updated_at = datetime('now') WHERE id = ?`).run(value, userId);
}

function getOutgoingWeights(db, sourceDim) {
  const rows = db.prepare('SELECT target_dim, weight FROM dimension_influence WHERE source_dim = ? AND weight > 0').all(sourceDim);
  const weights = {};
  for (const row of rows) weights[row.target_dim] = row.weight;
  return weights;
}

function getWeight(db, source, target) {
  const row = db.prepare('SELECT weight FROM dimension_influence WHERE source_dim = ? AND target_dim = ?').get(source, target);
  return row ? row.weight : 0;
}

function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i]; sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i]; sumY2 += y[i] * y[i];
  }
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den === 0 ? 0 : num / den;
}

// 获取最近传播记录
export function getRecentPropagations(db, userId, limit = 10) {
  return db.prepare('SELECT * FROM propagation_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
}
