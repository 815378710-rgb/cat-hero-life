// 神经协调器 - 激活所有神经元的核心调度器
// 每15分钟运行一次完整的神经网络循环

import { propagate as neuralPropagate, initInfluenceMatrix } from './neural-engine.js';
import { calculateCurrentEnergy, learnEnergyBaseline } from './energy-model.js';
import { takeBalanceSnapshot } from './balance-radar.js';
import { checkDecisionOutcome, getPendingChecks } from './decision-tracker.js';
import { consolidateMemories, decayMemories } from './memory-system.js';
import { checkTitleUnlocks } from './gamification-deep.js';

let coordinatorRunning = false;

// 获取当前所有维度分数
function getDimensionScores(db, userId) {
  const user = db.prepare('SELECT stat_health, stat_finance, stat_learning, stat_career, stat_social, stat_mental, stat_habits, stat_creativity FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  return {
    health: user.stat_health, finance: user.stat_finance, learning: user.stat_learning,
    career: user.stat_career, social: user.stat_social, mental: user.stat_mental,
    habits: user.stat_habits, creativity: user.stat_creativity
  };
}

// 主循环：每次tick执行完整的神经传播
async function neuralTick(db) {
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (!user) return;

    const userId = user.id;
    const before = getDimensionScores(db, userId);
    if (!before) return;

    // 1. 神经传播：维度变化影响其他维度
    try {
      const delta = {};
      for (const [dim, score] of Object.entries(before)) {
        // 对比上次记录的变化
        const lastCheck = db.prepare('SELECT score FROM dimension_history WHERE user_id = ? AND dimension = ? ORDER BY recorded_at DESC LIMIT 1').get(userId, dim);
        if (lastCheck && Math.abs(score - lastCheck.score) > 3) {
          delta[dim] = score - lastCheck.score;
        }
        // 记录当前分数
        db.prepare('INSERT INTO dimension_history (id, user_id, dimension, score) VALUES (?, ?, ?, ?)')
          .run(Date.now().toString(36) + Math.random().toString(36).slice(2, 8), userId, dim, score);
      }

      if (Object.keys(delta).length > 0) {
        let allAffected = [];
        for (const [dim, value] of Object.entries(delta)) {
          const result = neuralPropagate(db, userId, dim, value);
          if (result?.affected?.length > 0) {
            allAffected = allAffected.concat(result.affected);
          }
        }
        if (allAffected.length > 0) {
          console.log(`🧠 神经传播: ${Object.keys(delta).join(',')} → 影响 ${allAffected.length} 个维度`);
        }
      }
    } catch (e) { console.error('传播失败:', e.message); }

    // 2. 能量系统：学习基线，计算当前能量
    try {
      learnEnergyBaseline(db, userId);
      calculateCurrentEnergy(db, userId);
    } catch (e) {}

    // 3. 平衡雷达快照
    try {
      takeBalanceSnapshot(db, userId);
    } catch (e) {}

    // 4. 决策追踪：检查待处理的决策结果
    try {
      const pending = getPendingChecks(db, userId);
      for (const decision of pending.slice(0, 3)) {
        checkDecisionOutcome(db, userId, decision.id);
      }
    } catch (e) {}

    // 5. 记忆系统：巩固短期→长期，衰减
    try {
      consolidateMemories(db, userId);
      decayMemories(db, userId);
    } catch (e) {}

    // 6. 称号解锁检查
    try {
      checkTitleUnlocks(db, userId);
    } catch (e) {}

    // 7. 交叉分析：检测维度关联并写入神经网络日志
    try {
      const after = getDimensionScores(db, userId);
      if (after) {
        const insights = [];
        for (const dim of Object.keys(after)) {
          const change = Math.abs(after[dim] - before[dim]);
          if (change > 2) {
            // 检查是否与金融数据相关
            if (dim === 'finance') {
              const healthChange = after.health - before.health;
              const mentalChange = after.mental - before.mental;
              if (healthChange < -1) insights.push(`财务压力影响健康(-${Math.abs(healthChange)})`);
              if (mentalChange < -1) insights.push(`财务压力影响心理(-${Math.abs(mentalChange)})`);
            }
            if (dim === 'health' && after.mental - before.mental < -1) {
              insights.push(`健康下降影响心理状态`);
            }
          }
        }

        if (insights.length > 0) {
          const msg = `[神经网络].${insights.join('; ')}`;
          db.prepare('INSERT INTO ai_memory (id, user_id, memory_layer, memory_type, title, content, summary, importance, tags, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(Date.now().toString(36) + Math.random().toString(36).slice(2, 8), userId, 'working', 'neural', '交叉维度分析', msg, msg.slice(0, 100), 7, 'neural,cross-dimension', 'neural-coordinator');
          
          // 严重异常 → 主动推微信
          for (const insight of insights) {
            if (insight.includes('压力') || insight.includes('严重')) {
              try {
                db.prepare('INSERT INTO pending_wechat_msgs (id, user_id, message, status) VALUES (?, ?, ?, ?)')
                  .run(Date.now().toString(36)+Math.random().toString(36).slice(2,8), userId, `🐱 神经警报：${insight}。老大需要聊聊吗？`, 'pending');
              } catch(e) {}
            }
          }
        }
      }
    } catch (e) {}

  } catch (e) {
    console.error('神经循环异常:', e.message);
  }
}

// 启动神经协调器
export function startNeuralCoordinator(db) {
  if (coordinatorRunning) return;
  coordinatorRunning = true;

  console.log('🧠 神经协调器已激活 - 每15分钟循环一次');

  // 立即运行一次
  neuralTick(db);

  // 每15分钟tick一次
  setInterval(() => neuralTick(db), 15 * 60 * 1000);

  return { stop: () => { coordinatorRunning = false; } };
}

// 获取神经状态摘要（供AI使用）
export function getNeuralContext(db, userId) {
  try {
    const influences = db.prepare(`
      SELECT source_dim, target_dim, importance, description 
      FROM neural_influence_log 
      WHERE user_id = ? AND created_at >= datetime('now','-7 days')
      ORDER BY created_at DESC LIMIT 5
    `).all(userId);

    const balanceLog = db.prepare(`
      SELECT overall_score, focus_area 
      FROM balance_snapshots 
      WHERE user_id = ? 
      ORDER BY created_at DESC LIMIT 1
    `).get(userId);

    const crossInsights = db.prepare(`
      SELECT content FROM ai_memory 
      WHERE user_id = ? AND tags LIKE '%neural%' 
      ORDER BY created_at DESC LIMIT 3
    `).all(userId);

    let context = '';

    if (balanceLog) {
      context += `\n[神经系统] 人生平衡度:${balanceLog.overall_score}分 关注领域:${balanceLog.focus_area || '全面'}`;
    }

    if (crossInsights.length > 0) {
      context += '\n[交叉分析] ' + crossInsights.map(i => i.content).join(' | ');
    }

    if (influences.length > 0) {
      context += '\n[维度影响] ' + influences.map(i => `${i.source_dim}→${i.target_dim}(${i.importance})`).join(', ');
    }

    return context;
  } catch (e) {
    return '';
  }
}
