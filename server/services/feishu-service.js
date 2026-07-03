// 猫猫侠 飞书消息服务
import { chatWithLLM, buildSystemPrompt, analyzeMessage, isAiEnabled } from './ai-engine.js';
import { getDb, createDbWrapper, saveDb } from '../db/init.js';
import { v4 as uuid } from 'uuid';
import { getAiMood, getMoodPrefix } from './life-engine.js';

let feishuConfig = {
  appId: '',
  appSecret: '',
  baseUrl: 'https://open.feishu.cn/open-apis',
  enabled: false
};

let accessToken = null;
let tokenExpiry = 0;

// 设置飞书配置
export function setFeishuConfig(config) {
  feishuConfig.appId = config.appId || '';
  feishuConfig.appSecret = config.appSecret || '';
  feishuConfig.enabled = !!(feishuConfig.appId && feishuConfig.appSecret);
  console.log(`飞书: ${feishuConfig.enabled ? '已配置' : '未配置'}`);
}

export function getFeishuConfig() {
  return {
    appId: feishuConfig.appId ? feishuConfig.appId.slice(0, 4) + '***' : '未配置',
    enabled: feishuConfig.enabled
  };
}

// 获取 tenant_access_token
async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  
  try {
    const response = await fetch(`${feishuConfig.baseUrl}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: feishuConfig.appId,
        app_secret: feishuConfig.appSecret
      })
    });
    
    const data = await response.json();
    if (data.code === 0) {
      accessToken = data.tenant_access_token;
      tokenExpiry = Date.now() + (data.expire - 300) * 1000; // 提前5分钟刷新
      return accessToken;
    }
    console.error('飞书token获取失败:', data);
    return null;
  } catch (e) {
    console.error('飞书token请求失败:', e.message);
    return null;
  }
}

// 发送消息到飞书
export async function sendFeishuMessage(chatId, message, msgType = 'text') {
  if (!feishuConfig.enabled) return { success: false, message: '飞书未配置' };
  
  const token = await getAccessToken();
  if (!token) return { success: false, message: 'token获取失败' };
  
  try {
    const body = {
      receive_id: chatId,
      msg_type: msgType,
      content: msgType === 'text' ? JSON.stringify({ text: message }) : message
    };
    
    const response = await fetch(`${feishuConfig.baseUrl}/im/v1/messages?receive_id_type=open_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    return { success: data.code === 0, data };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// 处理收到的飞书消息
export async function handleFeishuMessage(event) {
  const db = createDbWrapper(getDb());
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) return;
  
  // 解析消息
  const message = event.message;
  const content = JSON.parse(message.content || '{}');
  const text = content.text || '';
  const chatId = message.chat_id;
  const senderId = event.sender?.sender_id?.open_id;
  
  if (!text || !chatId) return;
  
  // 保存用户消息
  db.prepare("INSERT INTO chat_history (user_id, role, content, metadata) VALUES (?, 'user', ?, ?)")
    .run(user.id, text, JSON.stringify({ source: 'feishu', chat_id: chatId, sender: senderId }));
  
  // 构建上下文
  const context = buildFullContext(db, user);
  const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
  const mood = getAiMood(db, user.id);
  const analysis = analyzeMessage(text);
  
  let response;
  
  // 使用LLM
  if (isAiEnabled()) {
    const systemPrompt = buildSystemPrompt(user, profile, context, user.personality_type || 'encouraging');
    const recentHistory = db.prepare("SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 8").all(user.id).reverse();
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory.map(m => ({ role: m.role === 'system' ? 'assistant' : m.role, content: m.content }))
    ];
    
    const llmResponse = await chatWithLLM(messages, { temperature: 0.85, maxTokens: 600 });
    if (llmResponse) {
      response = { text: llmResponse, metadata: { intent: analysis.intent, source: 'llm' } };
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
      db.prepare("INSERT INTO ai_memory (id, user_id, memory_type, title, content, summary, importance, source) VALUES (?, ?, 'conversation', ?, ?, ?, ?, 'feishu')")
        .run(uuid(), user.id, `飞书对话: ${text.slice(0, 30)}`, text + ' → ' + response.text, response.text.slice(0, 100), response.metadata.importance);
    }
  } catch {}
  
  // 回复到飞书
  await sendFeishuMessage(chatId, response.text);
}

// 构建上下文
function buildFullContext(db, user) {
  const today = new Date().toISOString().split('T')[0];
  const todayTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'pending'").get(user.id, today);
  const completedTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(user.id, today);
  const todayCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(user.id, today);
  const habits = db.prepare("SELECT h.name, (SELECT COUNT(*) FROM habit_logs hl WHERE hl.habit_id = h.id AND date(hl.logged_at) = date('now')) as today_count, h.current_streak FROM habits h WHERE h.user_id = ? AND h.is_active = 1").all(user.id);
  const importantMemories = db.prepare("SELECT title, summary FROM ai_memory WHERE user_id = ? AND importance >= 6 ORDER BY created_at DESC LIMIT 8").all(user.id);
  const milestones = db.prepare("SELECT title FROM ai_memory WHERE user_id = ? AND is_milestone = 1 ORDER BY created_at DESC LIMIT 5").all(user.id);
  
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
    importantMemories, milestones
  };
}

// 主动推送消息到飞书
export async function pushToFeishu(message) {
  // 需要配置默认chat_id
  const db = createDbWrapper(getDb());
  try {
    const config = db.prepare("SELECT value FROM system_config WHERE key = 'feishu_chat_id'").get();
    if (config?.value) {
      return await sendFeishuMessage(config.value, message);
    }
    return { success: false, message: '未配置飞书chat_id' };
  } catch {
    return { success: false, message: '飞书推送失败' };
  }
}
