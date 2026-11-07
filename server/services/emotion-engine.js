// 深度情感理解引擎 — 多轮情绪曲线 + LLM情感分析 + 趋势预警
import { chatWithLLM, isAiEnabled } from './ai-engine.js';
import { getDb } from '../db/init.js';
import { v4 as uid } from 'uuid';

// ===== Schema =====
export function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS emotion_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      message_text TEXT,
      primary_emotion TEXT,
      secondary_emotion TEXT,
      intensity REAL DEFAULT 3,
      confidence REAL DEFAULT 0.7,
      trigger_words TEXT,
      context_summary TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_emotion_user_time ON emotion_log(user_id, created_at);
  `);
}

// ===== 核心：LLM 深度情绪分析（替代关键词匹配）=====

export async function analyzeEmotionDeep(message, recentContext = [], userId = null) {
  // 降级：AI 不可用时用关键词兜底
  if (!isAiEnabled()) {
    return analyzeWithKeywords(message);
  }

  try {
    const contextStr = recentContext.slice(-3).map(m => 
      `${m.role === 'user' ? '用户' : 'AI'}: ${(m.content || '').slice(0, 100)}`
    ).join('\n');

    const prompt = `你是一位专业的情绪分析师。请深度分析以下消息中的情绪——不要只看表面关键词，要理解语境、潜台词、和"反话"。

${contextStr ? '最近对话上下文:\n' + contextStr + '\n\n' : ''}
当前消息: "${message.slice(0, 300)}"

分析要点：
1. 表面情绪和深层情绪可能不同（"哈哈哈哈没事"往往有事）
2. 如果之前对话显示情绪低落，当前"还好"可能是回避
3. 注意情绪转换点（从愤怒突然变平静→可能是压抑）

返回JSON:
{
  "primary": "happy/sad/anxious/tired/angry/lonely/confused/motivated/neutral",
  "secondary": "同上或null",
  "intensity": 1-5,
  "confidence": 0-1,
  "triggers": ["触发词或短语"],
  "subtext": "潜台词分析（如果有）",
  "suggested_response_tone": "warm/direct/gentle/humorous/careful"
}

只返回JSON。`;

    const result = await chatWithLLM([{ role: 'user', content: prompt }], { temperature: 0.1, maxTokens: 200 });
    if (result) {
      const match = result.match(/\{[\s\S]*\}/)?.[0];
      if (match) {
        const analysis = JSON.parse(match);
        
        // 存储到情绪日志
        if (userId) {
          logEmotion(userId, message, analysis);
        }
        
        return {
          emotion: analysis.primary,
          secondary: analysis.secondary || null,
          intensity: analysis.intensity || 3,
          confidence: analysis.confidence || 0.7,
          triggers: analysis.triggers || [],
          subtext: analysis.subtext || null,
          suggestedTone: analysis.suggested_response_tone || 'warm',
          _source: 'llm',
        };
      }
    }
  } catch (e) {
    console.error('analyzeEmotionDeep:', e.message);
  }
  
  // LLM 失败降级
  const kw = analyzeWithKeywords(message);
  if (userId) logEmotion(userId, message, kw);
  return kw;
}

// ===== 关键词兜底（保留兼容）=====

function analyzeWithKeywords(message) {
  const msg = message.toLowerCase();
  const patterns = [
    { emotion: 'sad', keywords: ['难过','伤心','哭','悲伤','郁闷','不开心','烦','失落','心碎','委屈','后悔','难受'], intensity: 4 },
    { emotion: 'anxious', keywords: ['焦虑','紧张','担心','害怕','恐惧','不安','压力大','崩溃','慌','失眠'], intensity: 4 },
    { emotion: 'tired', keywords: ['累','疲惫','困','没精神','不想动','躺平','摆烂','好累','加班','熬夜','好困'], intensity: 3 },
    { emotion: 'happy', keywords: ['开心','高兴','快乐','爽','棒','太好了','哈哈','不错','成功','通过'], intensity: 4 },
    { emotion: 'angry', keywords: ['生气','愤怒','烦死','气死','讨厌','受够了'], intensity: 5 },
    { emotion: 'lonely', keywords: ['孤独','寂寞','一个人','没人','孤单'], intensity: 3 },
    { emotion: 'motivated', keywords: ['加油','努力','奋斗','开始','行动','冲','我要'], intensity: 4 },
  ];

  for (const p of patterns) {
    const matchCount = p.keywords.filter(k => msg.includes(k)).length;
    if (matchCount > 0) {
      return {
        emotion: p.emotion, secondary: null,
        intensity: Math.min(5, p.intensity + matchCount),
        confidence: 0.6 + matchCount * 0.1,
        triggers: p.keywords.filter(k => msg.includes(k)),
        subtext: null, suggestedTone: 'warm',
        _source: 'keywords',
      };
    }
  }
  return { emotion: 'neutral', secondary: null, intensity: 2, confidence: 0.5, triggers: [], subtext: null, suggestedTone: 'warm', _source: 'keywords' };
}

// ===== 情绪日志 =====

function logEmotion(userId, message, analysis) {
  try {
    const db = getDb();
    ensureTable(db);
    db.prepare(`
      INSERT INTO emotion_log (id, user_id, message_text, primary_emotion, secondary_emotion, intensity, confidence, trigger_words, context_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uid(), userId, message.slice(0, 200),
      analysis.primary || analysis.emotion,
      analysis.secondary || null,
      analysis.intensity || 3,
      analysis.confidence || 0.7,
      JSON.stringify(analysis.triggers || []),
      analysis.subtext || null
    );
  } catch (e) {
    console.error('logEmotion:', e.message);
  }
}

// ===== 情绪曲线追踪 =====

export function getEmotionCurve(userId, hours = 24) {
  try {
    const db = getDb();
    ensureTable(db);
    return db.prepare(`
      SELECT primary_emotion as emotion, intensity, created_at, message_text
      FROM emotion_log WHERE user_id = ? AND created_at >= datetime('now', ?)
      ORDER BY created_at ASC
    `).all(userId, `-${hours} hours`);
  } catch (e) {
    return [];
  }
}

// ===== 情绪趋势预警 =====

export function getEmotionTrend(userId) {
  const curve = getEmotionCurve(userId, 72); // 最近3天
  if (curve.length < 3) return null;

  const negativeEmotions = ['sad', 'anxious', 'tired', 'angry', 'lonely'];
  let negativeStreak = 0;
  let maxNegativeStreak = 0;
  let avgIntensity = 0;

  for (const entry of curve) {
    avgIntensity += entry.intensity;
    if (negativeEmotions.includes(entry.emotion)) {
      negativeStreak++;
      maxNegativeStreak = Math.max(maxNegativeStreak, negativeStreak);
    } else {
      negativeStreak = 0;
    }
  }
  avgIntensity /= curve.length;

  // 情绪转换检测
  const firstHalf = curve.slice(0, Math.floor(curve.length / 2));
  const secondHalf = curve.slice(Math.floor(curve.length / 2));
  const firstNeg = firstHalf.filter(e => negativeEmotions.includes(e.emotion)).length;
  const secondNeg = secondHalf.filter(e => negativeEmotions.includes(e.emotion)).length;
  const isWorsening = secondNeg > firstNeg * 1.5;
  const isImproving = firstNeg > secondNeg * 1.5;

  // 最近情绪
  const latest = curve[curve.length - 1];
  const dominant = getDominantEmotion(curve);

  return {
    sampleCount: curve.length,
    dominantEmotion: dominant,
    latestEmotion: latest?.emotion,
    latestIntensity: latest?.intensity,
    avgIntensity: Math.round(avgIntensity * 10) / 10,
    negativeStreak: maxNegativeStreak,
    trend: isWorsening ? 'worsening' : isImproving ? 'improving' : 'stable',
    alert: generateEmotionAlert(dominant, maxNegativeStreak, isWorsening, avgIntensity),
  };
}

function getDominantEmotion(curve) {
  const counts = {};
  for (const entry of curve) {
    counts[entry.emotion] = (counts[entry.emotion] || 0) + 1;
  }
  let max = 0, dominant = 'neutral';
  for (const [emo, count] of Object.entries(counts)) {
    if (count > max) { max = count; dominant = emo; }
  }
  return dominant;
}

function generateEmotionAlert(dominant, streak, worsening, intensity) {
  const alerts = [];
  
  if (dominant === 'sad' && streak >= 3) {
    alerts.push('用户近期持续低落，建议主动关怀');
  }
  if (dominant === 'anxious' && intensity > 3.5) {
    alerts.push('用户焦虑程度较高，建议了解压力源');
  }
  if (dominant === 'tired' && streak >= 3) {
    alerts.push('用户持续疲惫，可能存在睡眠或工作量问题');
  }
  if (worsening) {
    alerts.push('情绪趋势在恶化，需要关注');
  }
  if (dominant === 'angry' && streak >= 2) {
    alerts.push('用户近期易怒，可能有需要倾诉的事');
  }

  return alerts.length > 0 ? alerts : null;
}

// ===== 情绪感知的回复建议 =====

export function getEmotionalResponseGuide(emotionAnalysis) {
  const { emotion, intensity, subtext, suggestedTone } = emotionAnalysis;
  
  const guide = {
    sad: { 
      approach: '先共情再引导', 
      avoid: ['轻浮话题','强行正能量','转移话题'],
      template: '先承认情绪是真实的→表达理解→温和询问愿意聊吗' 
    },
    anxious: {
      approach: '帮助理清头绪',
      avoid: ['增加压力','催促决定','说"别担心"'],
      template: '帮ta拆解问题→问具体担忧→给可操作的下一步'
    },
    tired: {
      approach: '关怀为主，减轻负担',
      avoid: ['安排大量任务','批评拖延'],
      template: '承认辛苦→建议休息→今天可以不用逼自己'
    },
    angry: {
      approach: '先让情绪释放',
      avoid: ['讲道理','站对立面','说"冷静"'],
      template: '表达"你生气是有道理的"→问发生了什么→不要急着给建议'
    },
    lonely: {
      approach: '陪伴感优先',
      avoid: ['建议"多社交"','显得敷衍'],
      template: '表达"我在这里"→肯定ta的价值→聊聊ta的想法'
    },
  };

  return {
    guide: guide[emotion] || { approach: '自然回应', avoid: [], template: '按正常对话节奏' },
    hasSubtext: !!subtext,
    subtext: subtext || null,
    suggestedTone: suggestedTone || 'warm',
  };
}
