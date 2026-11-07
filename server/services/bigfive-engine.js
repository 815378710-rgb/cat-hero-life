// 大五人格引擎 (OCEAN Model)
// Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism
// 基于关键词模式匹配做基线评分，支持跨时间平滑和趋势分析

export const OCEAN_DIMENSIONS = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

export const bigFiveLabels = {
  openness: '开放性',
  conscientiousness: '尽责性',
  extraversion: '外向性',
  agreeableness: '宜人性',
  neuroticism: '神经质'
};

// 每个维度的关键词/模式匹配
const DIMENSION_PATTERNS = {
  openness: {
    positive: ['好奇', '探索', '新想法', '艺术', '创意', '冒险', '尝试', '旅行', '学习', '新鲜', '变化', '创新', '想象', '审美', '哲学', '思考', '不同', '未知', '发现', '灵感'],
    negative: ['无聊', '枯燥', '重复', '单调', '没意思', '老样子']
  },
  conscientiousness: {
    positive: ['自律', '完成', '计划', '条理', '准时', '坚持', '认真', '负责', '努力', '目标', '规律', '整理', '细节', '检查', '准备', '安排', '效率', '专注', '执行', '做到'],
    negative: ['拖延', '放弃', '懒', '不想动', '推迟', '忘了', '摆烂']
  },
  extraversion: {
    positive: ['聚会', '朋友', '社交', '热闹', '表达', '主动', '人群', '聊天', '见面', '活动', '团队', '交流', '分享', '外向', '兴奋', '热情', '约', '一起', '认识', '见'],
    negative: ['独处', '安静', '不想说话', '回避', '社恐']
  },
  agreeableness: {
    positive: ['理解', '体谅', '帮助', '信任', '合作', '包容', '友善', '关心', '照顾', '支持', '同情', '善良', '配合', '和谐', '感恩', '谢谢', '团队', '家人', '原谅', '谦让'],
    negative: ['争吵', '不满', '讨厌', '烦人', '看不惯', '不配合']
  },
  neuroticism: {
    positive: ['焦虑', '担心', '压力', '烦躁', '紧张', '不安', '害怕', '情绪化', '敏感', '失眠', '难过', '崩溃', '控制不住', '反复想', '自责', '后悔', '患得患失', '恐慌', '抑郁', '低落'],
    negative: ['淡定', '无所谓', '放宽心', '没事', '不慌', '从容']
  }
};

// 维度解读文本
const DIMENSION_INTERPRETATIONS = {
  openness: {
    high: '好奇心强，喜欢尝试新事物，思维开放',
    low: '偏好熟悉和传统，做事稳健'
  },
  conscientiousness: {
    high: '自律认真，做事有计划有条理',
    low: '随性自由，不喜欢被约束'
  },
  extraversion: {
    high: '喜欢社交和表达，从与人互动中获得能量',
    low: '偏好独处和安静，需要个人空间'
  },
  agreeableness: {
    high: '善解人意，重视合作与关系和谐',
    low: '独立自主，更关注目标和原则'
  },
  neuroticism: {
    high: '情绪敏感，容易感到压力和焦虑',
    low: '情绪稳定，遇事沉着冷静'
  }
};

const DEFAULT_SCORE = 50;
const SMOOTH_WEIGHT = 0.8; // old weight
const NEW_WEIGHT = 0.2;    // new weight

// 从文本中评分单个维度
function scoreDimension(text, dim) {
  const patterns = DIMENSION_PATTERNS[dim];
  const evidence = [];
  let posCount = 0;
  let negCount = 0;

  for (const kw of patterns.positive) {
    const count = (text.match(new RegExp(kw, 'g')) || []).length;
    if (count > 0) {
      evidence.push(`+${kw}`);
      posCount += count;
    }
  }
  for (const kw of patterns.negative) {
    const count = (text.match(new RegExp(kw, 'g')) || []).length;
    if (count > 0) {
      evidence.push(`-${kw}`);
      negCount += count;
    }
  }

  const totalKeywords = patterns.positive.length + patterns.negative.length;
  const netMatches = posCount - negCount;

  // 基础分: 50 +/- 根据匹配量调整
  let newScore;
  if (posCount + negCount === 0) {
    newScore = DEFAULT_SCORE - 2; // 无证据时轻微回退
  } else {
    // 每1个净正向匹配 +5分，最多+30；每1个净负向匹配 -5分，最多-30
    const adjustment = Math.max(-30, Math.min(30, netMatches * 5));
    newScore = Math.round(DEFAULT_SCORE + adjustment);
  }
  newScore = Math.max(5, Math.min(95, newScore));

  // 置信度: 基于关键词命中数量
  const confidence = Math.min(1.0, (posCount + negCount) / 4);

  return { score: newScore, confidence, evidence };
}

// 对外评分函数
export function scoreBigFive(text, userContext = {}) {
  const { db, user } = userContext;
  const results = {};

  for (const dim of OCEAN_DIMENSIONS) {
    const { score: newScore, confidence, evidence } = scoreDimension(text, dim);

    // 读取已有分数做平滑
    let oldScore = DEFAULT_SCORE;
    if (db && user) {
      try {
        const existing = db.prepare(
          'SELECT score FROM bigfive_scores WHERE user_id = ? AND dimension = ? ORDER BY recorded_at DESC LIMIT 1'
        ).get(user.id, dim);
        if (existing) {
          oldScore = existing.score;
        }
      } catch(e) { /* table may not exist yet */ }
    }

    const smoothedScore = Math.round(SMOOTH_WEIGHT * oldScore + NEW_WEIGHT * newScore);

    results[dim] = {
      score: smoothedScore,
      confidence: Math.round(confidence * 100) / 100,
      recentEvidence: evidence.slice(0, 5)
    };

    // 持久化到 bigfive_scores 表
    if (db && user) {
      try {
        const id = `bf_${user.id.slice(0, 8)}_${dim}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        db.prepare(
          `INSERT INTO bigfive_scores (id, user_id, dimension, score, confidence, evidence, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
        ).run(id, user.id, dim, smoothedScore, confidence, JSON.stringify(evidence.slice(0, 5)));
      } catch(e) { /* table may not exist yet */ }
    }
  }

  return results;
}

// 获取用户当前大五人格画像
export function getBigFiveProfile(db, userId) {
  const profile = {};

  for (const dim of OCEAN_DIMENSIONS) {
    try {
      const latest = db.prepare(
        'SELECT score, confidence, evidence, recorded_at FROM bigfive_scores WHERE user_id = ? AND dimension = ? ORDER BY recorded_at DESC LIMIT 1'
      ).get(userId, dim);

      const allTime = db.prepare(
        'SELECT AVG(score) as avg_score, COUNT(*) as cnt FROM bigfive_scores WHERE user_id = ? AND dimension = ?'
      ).get(userId, dim);

      const recent7d = db.prepare(
        "SELECT AVG(score) as avg_score FROM bigfive_scores WHERE user_id = ? AND dimension = ? AND recorded_at >= datetime('now', '-7 days')"
      ).get(userId, dim);

      const currentScore = latest ? Math.round(latest.score) : DEFAULT_SCORE;
      const allTimeAvg = allTime?.avg_score ? Math.round(allTime.avg_score) : DEFAULT_SCORE;
      const recentAvg = recent7d?.avg_score ? Math.round(recent7d.avg_score) : currentScore;

      profile[dim] = {
        label: bigFiveLabels[dim],
        current: currentScore,
        confidence: latest ? latest.confidence : 0.3,
        allTimeAvg,
        recordCount: allTime?.cnt || 0,
        trend: recentAvg - allTimeAvg,
        interpretation: currentScore >= 60
          ? DIMENSION_INTERPRETATIONS[dim].high
          : (currentScore <= 40 ? DIMENSION_INTERPRETATIONS[dim].low : '适中'),
        lastUpdated: latest?.recorded_at || null
      };
    } catch(e) {
      profile[dim] = {
        label: bigFiveLabels[dim],
        current: DEFAULT_SCORE,
        confidence: 0.3,
        allTimeAvg: DEFAULT_SCORE,
        recordCount: 0,
        trend: 0,
        interpretation: '数据不足',
        lastUpdated: null
      };
    }
  }

  return profile;
}

// 描述分数区间
function describeScore(dim, score) {
  const label = bigFiveLabels[dim];
  if (score >= 75) return `${label}很高`;
  if (score >= 60) return `${label}偏高`;
  if (score >= 45) return `${label}适中`;
  if (score >= 30) return `${label}偏低`;
  return `${label}很低`;
}

// 构建注入 LLM 的大五人格上下文字符串
export function buildBigFiveContext(db, userId) {
  try {
    const profile = getBigFiveProfile(db, userId);
    const lines = [];

    lines.push('[用户大五人格画像]');

    for (const dim of OCEAN_DIMENSIONS) {
      const d = profile[dim];
      const trendSymbol = d.trend > 5 ? ' ↑' : (d.trend < -5 ? ' ↓' : '');
      lines.push(`${d.label}: ${d.current}/100 (${describeScore(dim, d.current)})${trendSymbol}`);
      
      if (d.recordCount > 3 && d.interpretation && d.interpretation !== '适中') {
        lines.push(`  → ${d.interpretation}`);
      }
    }

    return '\n' + lines.join('\n');
  } catch(e) {
    return '';
  }
}
