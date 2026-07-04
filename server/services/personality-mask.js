// 猫猫侠 人格面具系统 - 风格有效性学习、情境感知、自动人格切换
import { v4 as uuid } from 'uuid';

const STYLES = ['encouraging', 'strict', 'funny'];
const CONTEXT_FACTORS = {
  emotion: ['sad', 'anxious', 'tired', 'happy', 'angry', 'lonely', 'confused', 'motivated', 'neutral'],
  topic: ['task', 'life_advice', 'casual', 'emotional_support', 'planning', 'greeting'],
  timeOfDay: ['morning', 'afternoon', 'evening', 'late_night'],
  energy: ['high', 'medium', 'low']
};

// 构建情境标签
export function buildContextTag(emotion, topic, timeOfDay, energy) {
  return [emotion || 'neutral', topic || 'casual', timeOfDay || 'afternoon', energy || 'medium'].join(':');
}

// 记录互动
export function recordInteraction(db, userId, style, contextTags, userReaction, emotionBefore, emotionAfter) {
  const id = uuid();
  db.prepare('INSERT INTO interaction_logs (id, user_id, ai_style_used, context_tags, user_reaction, emotion_before, emotion_after) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, style, JSON.stringify(contextTags), userReaction, emotionBefore, emotionAfter);

  // 更新该情境下的风格有效性
  const effectMap = { engaged: 0.8, positive: 1.0, ignored: -0.3, negative: -0.8 };
  let effectScore = effectMap[userReaction] || 0;

  if (emotionAfter !== null && emotionBefore !== null) {
    if (emotionAfter > emotionBefore) effectScore += 0.3;
    else if (emotionAfter < emotionBefore) effectScore -= 0.2;
  }

  for (const tag of contextTags) {
    const existing = db.prepare('SELECT * FROM personality_dynamics WHERE user_id = ? AND context = ? AND style = ?').get(userId, tag, style);

    if (existing) {
      const newEff = existing.effectiveness * 0.7 + effectScore * 0.3;
      db.prepare('UPDATE personality_dynamics SET effectiveness = ?, sample_count = sample_count + 1, updated_at = datetime("now") WHERE id = ?')
        .run(Math.max(-1, Math.min(1, newEff)), existing.id);
    } else {
      db.prepare('INSERT INTO personality_dynamics (user_id, context, style, effectiveness, sample_count) VALUES (?, ?, ?, ?, 1)')
        .run(userId, tag, style, effectScore);
    }
  }
}

// 选择最佳风格
export function selectStyle(db, userId, contextTags) {
  // 收集该情境下所有风格的有效性
  const styleScores = {};
  for (const style of STYLES) {
    let totalEff = 0, totalCount = 0;
    for (const tag of contextTags) {
      const record = db.prepare('SELECT effectiveness, sample_count FROM personality_dynamics WHERE user_id = ? AND context = ? AND style = ?').get(userId, tag, style);
      if (record) {
        totalEff += record.effectiveness * record.sample_count;
        totalCount += record.sample_count;
      }
    }
    styleScores[style] = totalCount > 0 ? totalEff / totalCount : 0;
  }

  // 如果所有样本不足，返回默认
  const totalSamples = Object.values(styleScores).reduce((a, b) => a + Math.abs(b), 0);
  if (totalSamples < 3) return 'encouraging';

  // epsilon-greedy: 80%选最优，20%探索
  const sorted = STYLES.sort((a, b) => styleScores[b] - styleScores[a]);
  if (Math.random() < 0.8) return sorted[0];

  // 探索时倾向样本少的
  const leastSampled = STYLES.sort(() => Math.random() - 0.5)[0];
  return leastSampled;
}

// 获取人格进化数据
export function getPersonalityEvolution(db, userId) {
  const dynamics = db.prepare('SELECT * FROM personality_dynamics WHERE user_id = ? AND sample_count >= 2 ORDER BY effectiveness DESC').all(userId);

  const contextMap = {};
  for (const d of dynamics) {
    if (!contextMap[d.context]) contextMap[d.context] = [];
    contextMap[d.context].push({ style: d.style, effectiveness: Math.round(d.effectiveness * 100), samples: d.sample_count });
  }

  return contextMap;
}

// 判断用户反应
export function inferUserReaction(message, emotionBefore, emotionAfter) {
  const positive = ['好的', '谢谢', '有道理', '明白了', '太好了', '嗯嗯', '对', '是的', '哈哈'];
  const negative = ['不要', '烦', '别说了', '不想', '无聊', '讨厌', '够了'];
  const engaged = message.length > 20; // 回复内容充实

  const msg = message.toLowerCase();
  if (negative.some(w => msg.includes(w))) return 'negative';
  if (positive.some(w => msg.includes(w))) return 'positive';
  if (engaged) return 'engaged';
  return 'ignored';
}

// 获取当前时间段
export function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'late_night';
}
