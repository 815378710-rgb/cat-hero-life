// 猫猫侠 深度对话引擎 - 追问链、节奏感知、主动发起
import { v4 as uuid } from 'uuid';

// 判断是否应该追问
export function shouldFollowUp(message, analysis, recentHistory) {
  const msgLen = message.length;
  const hasEmotion = analysis.emotion && analysis.emotion !== 'neutral';
  const hasVagueInfo = /有点|可能|好像|大概|不太/.test(message);
  const mentionsEvent = /昨天|今天|上周|最近|昨天晚上/.test(message);
  const isShortReply = msgLen < 10;

  // 短回复不追问
  if (isShortReply && !hasEmotion) return { should: false, reason: 'short_reply' };

  // 情绪波动时追问
  if (['sad', 'anxious', 'angry', 'lonely'].includes(analysis.emotion)) {
    return { should: true, reason: 'emotion_support', followUpType: 'emotion' };
  }

  // 提到事件但信息不完整
  if (mentionsEvent && hasVagueInfo) {
    return { should: true, reason: 'incomplete_info', followUpType: 'clarify' };
  }

  // 重要话题但没展开
  if (['life_advice', 'plan'].includes(analysis.intent) && msgLen < 30) {
    return { should: true, reason: 'important_topic', followUpType: 'expand' };
  }

  return { should: false };
}

// 生成追问
export function generateFollowUp(message, analysis, followUpType, userName) {
  const followUps = {
    emotion: {
      sad: [`${userName}，想说说发生了什么吗？我在这里听~`, `抱抱~ 是什么事情让你难过了？`],
      anxious: [`${userName}，你最担心的是什么？说出来可能会好一点`, `深呼吸~ 焦虑的时候试着把担忧拆成小步骤`],
      angry: [`先冷静一下~ 是什么让你这么生气？`, `${userName}，深呼吸三次。然后和我说说？`],
      lonely: [`我在这里陪你~ 想聊聊吗？`, `${userName}，你不是一个人。有什么想说的？`]
    },
    clarify: [
      `能具体说说吗？我想更好地理解你的情况`,
      `这件事对你影响大吗？`,
      `你当时是什么感觉？`
    ],
    expand: [
      `能再详细说说吗？我想帮你好好想想`,
      `你觉得最主要的问题是什么？`,
      `这件事你有什么打算？`
    ]
  };

  const options = followUps[followUpType]?.[analysis.emotion] || followUps[followUpType] || followUps.expand;
  return options[Math.floor(Math.random() * options.length)];
}

// 对话节奏感知
export function analyzeConversationRhythm(db, userId) {
  const recent = db.prepare('SELECT role, content, created_at FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId).reverse();

  if (recent.length < 3) return { rhythm: 'new', suggestion: 'normal' };

  const userMessages = recent.filter(m => m.role === 'user');
  const avgLength = userMessages.reduce((s, m) => s + m.content.length, 0) / (userMessages.length || 1);

  // 计算回复间隔
  const intervals = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].role === 'user' && recent[i - 1].role === 'assistant') {
      intervals.push(new Date(recent[i].created_at) - new Date(recent[i - 1].created_at));
    }
  }
  const avgInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 60000;

  // 判断节奏
  if (avgLength > 50 && avgInterval < 120000) {
    return { rhythm: 'deep_engagement', suggestion: '该用户正在深度倾诉，多听少说，用共情回应' };
  }
  if (avgLength < 10 && avgInterval > 300000) {
    return { rhythm: 'disengaged', suggestion: '该用户心不在焉，简短回复，不要追问' };
  }
  if (avgLength < 10 && avgInterval < 60000) {
    return { rhythm: 'quick_chat', suggestion: '快速对话模式，保持简洁有趣' };
  }

  return { rhythm: 'normal', suggestion: '正常对话节奏' };
}

// 主动发起话题建议
export function suggestProactiveTopic(db, userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const today = now.toISOString().split('T')[0];

  // 最近对话
  const lastMessage = db.prepare('SELECT created_at FROM chat_history WHERE user_id = ? AND role = "user" ORDER BY created_at DESC LIMIT 1').get(userId);
  const hoursSinceLastMsg = lastMessage ? (Date.now() - new Date(lastMessage.created_at)) / 3600000 : 999;

  // 早上问候
  if (hour >= 7 && hour <= 9 && day >= 1 && day <= 5) {
    return { type: 'morning', message: `早安~ 新的一天开始了！今天有什么想完成的吗？`, priority: 'normal' };
  }

  // 周五下午
  if (day === 5 && hour >= 14 && hour <= 17) {
    return { type: 'friday', message: `快到周末了！这周辛苦了，有什么想犒劳自己的？`, priority: 'low' };
  }

  // 长时间未联系
  if (hoursSinceLastMsg > 72) {
    return { type: 'reconnect', message: `好久没聊了，最近怎么样？`, priority: 'high' };
  }

  // 情绪持续低落
  const recentMood = db.prepare('SELECT AVG(mood_score) as avg FROM mental_mood_diary WHERE user_id = ? AND diary_date >= date("now", "-5 days")').get(userId);
  if (recentMood?.avg && recentMood.avg < 2.5) {
    return { type: 'concern', message: `最近感觉你不太开心，想聊聊吗？`, priority: 'high' };
  }

  return null;
}
