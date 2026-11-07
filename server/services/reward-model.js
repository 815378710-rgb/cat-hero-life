// 神经科学奖赏模型 — 多巴胺 / 奖赏预测误差(RPE) / 变比率强化 / 享乐适应
//
// 理论根基 (🧠 认知层 · Neuroscience):
//  - Rescorla-Wagner / 多巴胺 RPE: 实际奖赏与预期之差驱动多巴胺释放。
//    意外之喜(低预期高产出)比例行公事更能强化行为。
//  - 变比率强化 (variable-ratio schedule): 间歇、不可预测的小惊喜比固定奖励
//    更能维持长期动机(老虎机效应),是留存的核心机制。
//  - 享乐适应 (hedonic adaptation): 重复相同奖赏的主观价值递减,需衰减以防数值膨胀。
//  - 连续性强化: 连胜/连续活跃给予温和递增奖励,符合行为塑造 schedule。
//
// 设计原则: 纯函数 + 失败安全。任何异常都回退到"基础奖励",绝不阻断主流程。
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/init.js';

const REWARD_STATE_TABLE = `
  CREATE TABLE IF NOT EXISTS reward_state (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action_sig TEXT NOT NULL,
    recent_count INTEGER DEFAULT 0,
    cumulative_dopamine REAL DEFAULT 0,
    last_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, action_sig)
  );
`;

function ensureTable(db) {
  try { db.exec(REWARD_STATE_TABLE); } catch {}
}

// 动作签名: 同类动作(同维度同类型)共享"新鲜度/饱和"状态
function signature(action) {
  return `${action.type || 'action'}:${action.dimension || 'any'}`;
}

// ===== 核心: 计算一次行为的主观奖赏 =====
// action: { type, dimension, baseExp=10, baseCoins=5, rarity='common', unexpected=false }
// 返回: { exp, coins, dopamineSignal(0-1), surprise(bool), satiation(0-1), note }
export function computeReward(db, userId, action = {}) {
  const base = {
    type: action.type || 'action',
    dimension: action.dimension || 'any',
    baseExp: Number.isFinite(action.baseExp) ? action.baseExp : 10,
    baseCoins: Number.isFinite(action.baseCoins) ? action.baseCoins : 5,
    rarity: action.rarity || 'common',
    unexpected: !!action.unexpected,
  };

  try {
    ensureTable(db);
    const sig = signature(base);
    const row = db.prepare(
      'SELECT * FROM reward_state WHERE user_id = ? AND action_sig = ?'
    ).get(userId, sig);

    // —— 1. 享乐适应: 近期重复次数 → 饱和衰减 ——
    // 越常做同动作, 主观价值越低(0.55 为底, 每 5 次再乘 0.85)
    const recent = row ? row.recent_count : 0;
    const satiationStep = Math.floor(recent / 5);
    const satiationFactor = Math.pow(0.85, satiationStep); // 1 → 0.85 → 0.72 ...
    const satiation = Math.min(1, recent / 20); // 0~1 暴露给前端做"边际递减"提示

    // —— 2. 奖赏预测误差(RPE): 稀有度 + 意外性 → 多巴胺尖峰 ——
    const rarityMult = { common: 1, rare: 1.4, epic: 1.9, legendary: 2.6 }[base.rarity] || 1;
    // 越不常做的动作, 预期越低, 实际发生时 RPE 越大
    const novelty = 1 / (1 + recent * 0.35); // recent=0→1, recent=5→0.36
    const rpeMult = (base.unexpected ? 1.8 : 1) * (0.6 + 0.4 * novelty) * rarityMult;

    // —— 3. 变比率强化: 8% 概率触发"惊喜奖励" (间歇不可预测) ——
    // 用 userId+日期+动作签名做确定性伪随机, 避免每次抖动
    const seedStr = `${userId}:${sig}:${new Date().toISOString().slice(0, 10)}`;
    const seed = hash01(seedStr);
    const surpriseHit = seed < 0.08;
    const surpriseMult = surpriseHit ? (1.5 + seed * 1.5) : 1; // 1.5x~3.0x

    // —— 4. 连续性强化: 当日活跃连击(签到/任务)温和递增 ——
    const streakBonus = computeStreakBonus(db, userId);

    // —— 合成 ——
    const rawExp = base.baseExp * satiationFactor * rpeMult * surpriseMult + streakBonus.exp;
    const rawCoins = base.baseCoins * satiationFactor * rpeMult * surpriseMult + streakBonus.coins;

    const exp = Math.max(1, Math.round(rawExp));
    const coins = Math.max(0, Math.round(rawCoins));

    // 多巴胺信号: 综合 RPE 强度 + 惊喜, 用于"猫猫侠兴奋度"展示 (0-1)
    const dopamineSignal = clamp01(
      0.25 + 0.35 * (rpeMult - 1) / 2 + (surpriseHit ? 0.3 : 0) + 0.1 * streakBonus.exp / 10
    );

    // 更新状态(原子化: recent_count 当日重置)
    upsertRewardState(db, userId, sig, row);

    let note = '';
    if (surpriseHit) note = '🎁 意外惊喜！变比率强化触发';
    else if (base.unexpected) note = '✨ 意外的好行为，多巴胺拉满';
    else if (satiation > 0.6) note = '📉 该动作已边际递减，换点新花样更赚';

    return {
      exp, coins,
      dopamineSignal: Math.round(dopamineSignal * 100) / 100,
      surprise: surpriseHit,
      satiation: Math.round(satiation * 100) / 100,
      rpeMultiplier: Math.round(rpeMult * 100) / 100,
      note,
    };
  } catch (e) {
    // 失败安全: 回退基础奖励
    console.error('[RewardModel] computeReward 降级:', e.message);
    return {
      exp: base.baseExp, coins: base.baseCoins,
      dopamineSignal: 0.3, surprise: false, satiation: 0, rpeMultiplier: 1,
      note: '', _fallback: true,
    };
  }
}

// 连胜/当日活跃连击: 温和递增(行为塑造), 不膨胀
function computeStreakBonus(db, userId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const user = db.prepare('SELECT consecutive_sign_days, level FROM users WHERE id = ?').get(userId);
    if (!user) return { exp: 0, coins: 0 };
    // 每连续 7 天给一次温和加成(指数封顶)
    const streak = user.consecutive_sign_days || 0;
    const tier = Math.floor(streak / 7);
    const bonus = Math.min(8, tier * 2); // 封顶 +8 exp
    return { exp: bonus, coins: Math.floor(bonus / 2) };
  } catch { return { exp: 0, coins: 0 }; }
}

function upsertRewardState(db, userId, sig, row) {
  const today = new Date().toISOString().split('T')[0];
  const lastDay = row ? (row.last_at || '').slice(0, 10) : null;
  const count = (lastDay === today ? (row.recent_count || 0) : 0) + 1;
  if (row) {
    db.prepare(
      'UPDATE reward_state SET recent_count = ?, last_at = datetime(\'now\'), cumulative_dopamine = cumulative_dopamine + 1 WHERE id = ?'
    ).run(count, row.id);
  } else {
    db.prepare(
      'INSERT INTO reward_state (id, user_id, action_sig, recent_count, cumulative_dopamine) VALUES (?, ?, ?, 1, 1)'
    ).run(uuid(), userId, sig);
  }
}

// 确定性伪随机 [0,1)
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// 供前端/调试: 当前用户各动作饱和概览
export function getRewardSatiation(db, userId) {
  try {
    ensureTable(db);
    return db.prepare(
      'SELECT action_sig, recent_count, cumulative_dopamine, last_at FROM reward_state WHERE user_id = ? ORDER BY cumulative_dopamine DESC LIMIT 20'
    ).all(userId);
  } catch { return []; }
}
