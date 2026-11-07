// 猫猫侠 Gewechat微信接入服务
// 基于Gewechat的iPad协议，不需要电脑开微信

import { chatWithLLM, buildSystemPrompt, analyzeMessage, isAiEnabled, loadSessionState, saveSessionState } from './ai-engine.js';
import { getDb, createDbWrapper, saveDb } from '../db/init.js';
import { v4 as uuid } from 'uuid';
import { getAiMood, getMoodPrefix } from './life-engine.js';
import { heartbeat, recordFailure, isDuplicateMessage, recordMessageProcessed, recordMessageError, recordPollAttempt, recordPollFailure } from './wechat-monitor.js';
import { analyzeEmotionDeep, getEmotionalResponseGuide } from './emotion-engine.js';

let gewechatConfig = {
  baseUrl: 'http://localhost:2531', // Gewechat API地址
  token: '',                        // 登录后获取的token
  wxid: '',                         // 微信ID
  enabled: false
};

// 设置Gewechat配置
export function setGewechatConfig(config) {
  if (config.baseUrl) gewechatConfig.baseUrl = config.baseUrl;
  if (config.token) gewechatConfig.token = config.token;
  if (config.wxid) gewechatConfig.wxid = config.wxid;
  gewechatConfig.enabled = !!(gewechatConfig.baseUrl && gewechatConfig.token);
  console.log(`Gewechat: ${gewechatConfig.enabled ? '已配置' : '未配置'}`);
}

export function getGewechatConfig() {
  return {
    baseUrl: gewechatConfig.baseUrl,
    token: gewechatConfig.token ? '***已配置***' : '未配置',
    wxid: gewechatConfig.wxid || '未获取',
    enabled: gewechatConfig.enabled
  };
}

// Gewechat API 请求封装
async function gewechatApi(path, body = null) {
  const url = `${gewechatConfig.baseUrl}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${gewechatConfig.token}`
  };
  
  try {
    const options = { method: body ? 'POST' : 'GET', headers };
    if (body) options.body = JSON.stringify(body);
    
    const response = await fetch(url, options);
    const data = await response.json();
    return data;
  } catch (e) {
    console.error('Gewechat API错误:', e.message);
    return { error: e.message };
  }
}

// 获取登录二维码
export async function getLoginQrCode() {
  const data = await gewechatApi('/login/get-qrcode');
  return data;
}

// 检查登录状态
export async function checkLoginStatus() {
  const data = await gewechatApi('/login/check-login');
  if (data.data?.token) {
    gewechatConfig.token = data.data.token;
    gewechatConfig.wxid = data.data.wxid || '';
    gewechatConfig.enabled = true;
    persistGewechatToken(); // 持久化 token 供冷启动恢复
  }
  return data;
}

// 发送消息
export async function sendWechatMessage(toWxid, message) {
  if (!gewechatConfig.enabled) return { success: false, message: 'Gewechat未配置' };
  
  const data = await gewechatApi('/message/send-text', {
    to_wxid: toWxid,
    content: message
  });
  
  return { success: !data.error, data };
}

// 处理收到的微信消息
export async function handleWechatMessage(message) {
  const db = createDbWrapper(getDb());
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) return;
  
  const content = message.content || '';
  const fromWxid = message.from_wxid || '';
  const msgId = message.msg_id || message.id || '';
  const isGroup = message.is_group || false;
  
  if (!content || !fromWxid) return;
  
  // 消息去重
  if (msgId && isDuplicateMessage('gewechat', msgId)) return;
  
  // 保存用户消息
  db.prepare("INSERT INTO chat_history (user_id, role, content, metadata) VALUES (?, 'user', ?, ?)")
    .run(user.id, content, JSON.stringify({ source: 'wechat', from: fromWxid, is_group: isGroup }));
  
  // 构建上下文
  const context = buildFullContext(db, user);
  
  // 注入语义记忆上下文
  try {
    const { getSemanticContextMemories } = await import('./memory-system.js');
    const semanticMemories = await getSemanticContextMemories(db, user.id, content, 8);
    if (semanticMemories?._semantic) {
      context.importantMemories = semanticMemories.all.map(m => ({
        title: m.title, summary: m.summary || m.content?.slice(0, 100)
      }));
    }
  } catch {}
  
  const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
  const mood = getAiMood(db, user.id);
  
  // 深度情绪分析（LLM驱动，替代关键词匹配）
  const recentMessages = db.prepare("SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 5").all(user.id);
  const emotion = await analyzeEmotionDeep(content, recentMessages, user.id);
  const responseGuide = getEmotionalResponseGuide(emotion);
  
  // 情绪趋势
  try {
    const { getEmotionTrend } = await import('./emotion-engine.js');
    const trend = getEmotionTrend(user.id);
    if (trend) context.emotionTrend = trend;
  } catch {}
  
  let response;
  
  // 使用LLM
  if (isAiEnabled()) {
    // 加载会话连续性状态
    const sessionState = loadSessionState(user.id);
    const systemPrompt = buildSystemPrompt(user, profile, context, user.personality_type || 'encouraging', sessionState);
    const recentHistory = db.prepare("SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").all(user.id).reverse();
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(emotion.subtext ? [{ role: 'system', content: `[情绪洞察] ${emotion.subtext}` }] : []),
      ...recentHistory.map(m => ({ role: m.role === 'system' ? 'assistant' : m.role, content: m.content }))
    ];
    
    const llmResponse = await chatWithLLM(messages, { temperature: 0.85, maxTokens: 600 });
    if (llmResponse) {
      response = { text: llmResponse, metadata: { intent: analysis.intent, source: 'llm' } };
      // 保存会话状态
      saveSessionState(user.id, content, llmResponse);
    }
  }
  
  // Fallback
  if (!response) {
    const name = user.username || '主人';
    const prefix = getMoodPrefix(mood.mood);
    response = { text: `${prefix}${name}说什么我都听着~ 🐱`, metadata: { intent: 'general' } };
  }
  
  // 保存AI回复
  db.prepare("INSERT INTO chat_history (user_id, role, content, metadata) VALUES (?, 'assistant', ?, ?)")
    .run(user.id, response.text, JSON.stringify(response.metadata || {}));
  
  // 保存记忆
  try {
    if (response.metadata?.importance >= 6) {
      db.prepare("INSERT INTO ai_memory (id, user_id, memory_type, title, content, summary, importance, source) VALUES (?, ?, 'conversation', ?, ?, ?, ?, 'wechat')")
        .run(uuid(), user.id, `微信对话: ${content.slice(0, 30)}`, content + ' → ' + response.text, response.text.slice(0, 100), response.metadata.importance);
    }
  } catch {}
  
  // 回复
  await sendWechatMessage(fromWxid, response.text);
}

// 构建上下文
function buildFullContext(db, user) {
  const today = new Date().toISOString().split('T')[0];
  const todayTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'pending'").get(user.id, today);
  const completedTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(user.id, today);
  const todayCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(user.id, today);
  const habits = db.prepare("SELECT h.name, (SELECT COUNT(*) FROM habit_logs hl WHERE hl.habit_id = h.id AND date(hl.logged_at) = date('now')) as today_count, h.current_streak FROM habits h WHERE h.user_id = ? AND h.is_active = 1").all(user.id);
  const importantMemories = db.prepare("SELECT title, summary FROM ai_memory WHERE user_id = ? AND importance >= 6 ORDER BY created_at DESC LIMIT 8").all(user.id);
  
  let energy = 50;
  try {
    const emotion = db.prepare('SELECT mood_score FROM emotion_logs WHERE user_id = ? ORDER BY log_date DESC LIMIT 1').get(user.id);
    energy = 50 + Math.min(user.consecutive_sign_days * 2, 20) + Math.min(todayCheckins.c * 3, 15);
    if (emotion?.mood_score) energy += (emotion.mood_score - 3) * 5;
    energy = Math.max(0, Math.min(100, energy));
  } catch {}
  
  return {
    todayTasks: todayTasks.c, completedToday: completedTasks.c,
    checkinsToday: todayCheckins.c, streak: user.consecutive_sign_days,
    level: user.level, coins: user.coins, energy,
    habits: habits.map(h => ({ name: h.name, done: h.today_count > 0, streak: h.current_streak })),
    importantMemories
  };
}

// 主动推送消息到微信
export async function pushToWechat(message) {
  if (!gewechatConfig.enabled || !gewechatConfig.wxid) return { success: false };
  return await sendWechatMessage(gewechatConfig.wxid, message);
}

// ===== 自动重连 =====

export function persistGewechatToken() {
  try {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS gewechat_session (key TEXT PRIMARY KEY, value TEXT)`);
    db.prepare('INSERT OR REPLACE INTO gewechat_session (key, value) VALUES (?, ?)').run('token', gewechatConfig.token);
    db.prepare('INSERT OR REPLACE INTO gewechat_session (key, value) VALUES (?, ?)').run('wxid', gewechatConfig.wxid);
    db.prepare('INSERT OR REPLACE INTO gewechat_session (key, value) VALUES (?, ?)').run('baseUrl', gewechatConfig.baseUrl);
  } catch (e) {
    console.error('persistGewechatToken:', e.message);
  }
}

export async function tryAutoReconnect() {
  try {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS gewechat_session (key TEXT PRIMARY KEY, value TEXT)`);
    
    const token = db.prepare("SELECT value FROM gewechat_session WHERE key = 'token'").get();
    const wxid = db.prepare("SELECT value FROM gewechat_session WHERE key = 'wxid'").get();
    const baseUrl = db.prepare("SELECT value FROM gewechat_session WHERE key = 'baseUrl'").get();
    
    if (token?.value && wxid?.value) {
      gewechatConfig.token = token.value;
      gewechatConfig.wxid = wxid.value;
      if (baseUrl?.value) gewechatConfig.baseUrl = baseUrl.value;
      gewechatConfig.enabled = true;
      console.log('Gewechat auto-reconnected with saved token');
      
      // 验证连接
      try {
        const checkData = await gewechatApi('/login/check-login');
        if (checkData.error) {
          gewechatConfig.enabled = false;
          console.log('Gewechat saved token invalid, need re-login');
        }
      } catch {}
      return gewechatConfig.enabled;
    }
  } catch (e) {
    console.error('tryAutoReconnect:', e.message);
  }
  return false;
}

// 启动消息监听（轮询模式，带自动重连）
let messagePollingInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

export function startMessagePolling() {
  if (messagePollingInterval) return;
  
  messagePollingInterval = setInterval(async () => {
    if (!gewechatConfig.enabled) {
      // 尝试自动重连
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`Gewechat reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        const reconnected = await tryAutoReconnect();
        if (!reconnected) return;
        reconnectAttempts = 0;
      }
      return;
    }
    
    try {
      recordPollAttempt('gewechat');
      const data = await gewechatApi('/message/get-new');
      if (data.error) {
        recordFailure('gewechat');
        recordPollFailure('gewechat');
        return;
      }
      
      // 心跳成功
      heartbeat('gewechat');
      
      if (data.data?.messages) {
        for (const msg of data.data.messages) {
          await handleWechatMessage(msg);
          recordMessageProcessed('gewechat');
        }
      }
    } catch (e) {
      console.error('Gewechat 消息轮询失败:', e.message);
      recordFailure('gewechat');
      recordPollFailure('gewechat');
    }
  }, 3000); // 每3秒检查一次新消息
  
  console.log('Gewechat消息监听已启动');
}

export function stopMessagePolling() {
  if (messagePollingInterval) {
    clearInterval(messagePollingInterval);
    messagePollingInterval = null;
  }
}
