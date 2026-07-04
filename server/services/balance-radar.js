// 猫猫侠 人生平衡雷达 - 形状分类、平衡评分、叙事生成
import { v4 as uuid } from 'uuid';

const ALL_DIMS = ['health', 'finance', 'learning', 'career', 'social', 'mental', 'habits', 'creativity'];
const DIM_NAMES = { health: '健康', finance: '财务', learning: '学习', career: '职业', social: '社交', mental: '心理', habits: '习惯', creativity: '创造' };

// 生成平衡快照
export function takeBalanceSnapshot(db, userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  const dimValues = {};
  for (const dim of ALL_DIMS) dimValues[dim] = user[`stat_${dim}`] || 0;

  const shapeType = classifyShape(dimValues);
  const balanceScore = calculateBalanceScore(dimValues);
  const narrative = generateNarrative(shapeType, dimValues, balanceScore, user.username);

  const id = uuid();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  db.prepare('INSERT INTO balance_snapshots (id, user_id, snapshot_date, dim_values, shape_type, balance_score, narrative) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, today, JSON.stringify(dimValues), shapeType, balanceScore, narrative);

  return { dimValues, shapeType, balanceScore, narrative };
}

// 形状分类算法
export function classifyShape(dimValues) {
  const values = ALL_DIMS.map(d => dimValues[d] || 0);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal;

  // 找最高和最低
  const sorted = ALL_DIMS.map(d => ({ dim: d, val: dimValues[d] || 0 })).sort((a, b) => b.val - a.val);
  const top2 = sorted.slice(0, 2);
  const bottom2 = sorted.slice(-2);

  if (std < 8 && mean > 50) return 'balanced_high';
  if (std < 8 && mean <= 50) return 'plateau_low';
  if (std < 12) return 'plateau';
  if (range > 40) return 'needle';
  if (top2[0].val > mean + 2 * std) return 'spike';
  if (bottom2[0].val < mean - 2 * std) return 'dip';

  // 内外倾判断
  const innerDims = ['mental', 'habits'];
  const outerDims = ['social', 'career'];
  const innerAvg = innerDims.reduce((s, d) => s + (dimValues[d] || 0), 0) / 2;
  const outerAvg = outerDims.reduce((s, d) => s + (dimValues[d] || 0), 0) / 2;
  if (innerAvg > outerAvg + 15) return 'introvert';
  if (outerAvg > innerAvg + 15) return 'extrovert';

  return 'irregular';
}

// 平衡度评分
export function calculateBalanceScore(dimValues) {
  const values = ALL_DIMS.map(d => dimValues[d] || 0);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
  return Math.max(0, Math.min(100, Math.round(100 - std * 3.3)));
}

// 叙事生成
function generateNarrative(shapeType, dimValues, balanceScore, username) {
  const sorted = ALL_DIMS.map(d => ({ dim: d, val: dimValues[d] || 0, name: DIM_NAMES[d] })).sort((a, b) => b.val - a.val);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const values = ALL_DIMS.map(d => dimValues[d] || 0);
  const mean = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const name = username || '主人';

  const templates = {
    balanced_high: `${name}，八个维度都在高位且均衡（平均${mean}分）。你已经做得很好了，接下来是突破上限。`,
    plateau_low: `${name}，八个维度都在低水位（平均${mean}分）。不是某一块不行，是整体需要启动。从最想改变的一块开始吧。`,
    plateau: `${name}，你的人生像一片高原——每个维度都在${mean}分左右。稳定是优点，但也要找机会突破。`,
    needle: `${name}，你像一根针——${top.name}很强（${top.val}），但${bottom.name}只有${bottom.val}。全面发展才能走更远。`,
    spike: `${name}，你的${top.name}维度特别突出（${top.val}分），这是你的优势。但别让其他维度被忽视。`,
    dip: `${name}，你的${bottom.name}维度只有${bottom.val}分，是整个系统的短板。木桶原理——最短的板决定能装多少水。`,
    introvert: `${name}，你的内在维度（心理/习惯）很强，外在（社交/职业）偏弱。内功不错，可以试试向外扩展。`,
    extrovert: `${name}，你的外在维度很强，但内在偏弱。社交和职业发展得好，也要照顾好自己的内心。`,
    irregular: `${name}，你的维度分布不规则，没有明显的模式。这说明你在不同方向都有尝试，挺好的。`
  };

  return templates[shapeType] || templates.irregular;
}

// 获取历史趋势
export function getBalanceTrend(db, userId, days = 30) {
  const snapshots = db.prepare('SELECT * FROM balance_snapshots WHERE user_id = ? ORDER BY snapshot_date DESC LIMIT ?').all(userId, days);
  return snapshots.map(s => ({
    date: s.snapshot_date,
    dimValues: JSON.parse(s.dim_values),
    shapeType: s.shape_type,
    balanceScore: s.balance_score
  }));
}
