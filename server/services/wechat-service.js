// 猫猫侠 微信消息服务 - Wechaty集成
import { chatWithLLM, buildSystemPrompt, analyzeMessage, isAiEnabled } from './ai-engine.js';
import { getDb, createDbWrapper, saveDb } from '../db/init.js';
import { v4 as uuid } from 'uuid';
import { getAiMood, getMoodPrefix } from './life-engine.js';

let bot = null;
let isRunning = false;
let botStatus = 'stopped';
let qrCode = null;
let loggedInUser = null;
let WechatyBuilder = null;
let ScanStatus = null;

// 懒加载 wechaty
async function loadWechaty() {
  if (WechatyBuilder) return true;
  try {
    const wechaty = await import('wechaty');
    WechatyBuilder = wechaty.WechatyBuilder;
    ScanStatus = wechaty.ScanStatus;
    return true;
  } catch (e) {
    console.error('❌ wechaty 未安装，请运行: npm install wechaty wechaty-puppet-wechat');
    return false;
  }
}

// 获取bot状态
export function getWechatStatus() {
  return {
    status: botStatus,
    isRunning,
    qrCode,
    loggedInUser: loggedInUser ? { name: loggedInUser.name(), id: loggedInUser.id } : null
  };
}

// 启动微信机器人
export async function startWechat(puppetType = 'wechat') {
  if (isRunning) {
    console.log('⚠️ 微信机器人已在运行');
    return { success: false, message: '已在运行' };
  }
  
  // 检查 wechaty 是否可用
  const loaded = await loadWechaty();
  if (!loaded) {
    return { success: false, message: '请先安装 wechaty: npm install wechaty wechaty-puppet-wechat' };
  }
  
  botStatus = 'starting';
  
  try {
    bot = WechatyBuilder.build({
      name: 'CatHeroBot',
      puppet: 'wechaty-puppet-wechat',
    });
    
    // 事件绑定
    bot.on('scan', onScan);
    bot.on('login', onLogin);
    bot.on('logout', onLogout);
    bot.on('message', onMessage);
    bot.on('error', onError);
    
    await bot.start();
    isRunning = true;
    
    return { success: true, message: '微信机器人启动中，请扫码登录...' };
  } catch (e) {
    botStatus = 'error';
    console.error('微信启动失败:', e.message);
    return { success: false, message: `启动失败: ${e.message}` };
  }
}

// 停止微信机器人
export async function stopWechat() {
  if (bot) {
    try {
      await bot.stop();
    } catch {}
    bot = null;
  }
  isRunning = false;
  botStatus = 'stopped';
  qrCode = null;
  loggedInUser = null;
  return { success: true, message: '已停止' };
}

// ===== 事件处理 =====

function onScan(qrcode, status) {
  if (status === ScanStatus?.Waiting || status === ScanStatus?.Timeout) {
    qrCode = qrcode;
    botStatus = 'scanning';
    if (qrcode) {
      console.log('📱 请用微信扫描二维码登录:');
      console.log(`二维码链接: https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`);
    }
  }
}

function onLogin(user) {
  loggedInUser = user;
  botStatus = 'running';
  qrCode = null;
  console.log(`✅ 微信登录成功: ${user.name()}`);
  
  // 记录登录
  try {
    const db = createDbWrapper(getDb());
    const localUser = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (localUser) {
      db.prepare("INSERT INTO ai_memory (id, user_id, memory_type, title, content, summary, importance, is_milestone, source) VALUES (?, ?, 'milestone', '微信连接成功', ?, ?, 8, 1, 'system')")
        .run(uuid(), localUser.id, `猫猫侠成功连接到微信账号: ${user.name()}`, '微信通道已建立');
    }
  } catch {}
}

function onLogout(user) {
  console.log(`❌ 微信登出: ${user.name()}`);
  loggedInUser = null;
  botStatus = 'stopped';
  isRunning = false;
}

async function onMessage(msg) {
  // 忽略自己发的消息
  if (msg.self()) return;
  // 忽略非文本消息（暂时）
  if (!msg.text() || msg.text().trim() === '') return;
  
  const talker = msg.talker();
  const room = msg.room();
  const text = msg.text().trim();
  
  // 私聊处理
  if (!room) {
    await handlePrivateMessage(talker, text, msg);
  }
  // 群聊处理（可选：只有@猫猫侠时才回复）
  else {
    // 检查是否被@
    const mentionSelf = await msg.mentionSelf();
    if (mentionSelf) {
      const cleanText = text.replace(/@猫猫侠\s*/g, '').trim();
      if (cleanText) {
        await handleGroupMessage(talker, room, cleanText, msg);
      }
    }
  }
}

// ===== 消息处理 =====

async function handlePrivateMessage(contact, text, msg) {
  const db = createDbWrapper(getDb());
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) return;
  
  // 保存用户消息到聊天记录
  const userName = contact.name();
  db.prepare("INSERT INTO chat_history (user_id, role, content, metadata) VALUES (?, 'user', ?, ?)")
    .run(user.id, text, JSON.stringify({ source: 'wechat', from: userName }));
  
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
  
  // Fallback到规则引擎
  if (!response) {
    response = generateRuleResponse(text, user, profile, context, analysis, db, mood);
  }
  
  // 保存AI回复
  db.prepare("INSERT INTO chat_history (user_id, role, content, metadata) VALUES (?, 'assistant', ?, ?)")
    .run(user.id, response.text, JSON.stringify(response.metadata || {}));
  
  // 保存记忆
  try {
    if (response.metadata?.importance >= 6) {
      db.prepare(`INSERT INTO ai_memory (id, user_id, memory_type, title, content, summary, dimension_id, emotion_tag, importance, source)
        VALUES (?, ?, 'conversation', ?, ?, ?, ?, ?, ?, 'wechat')`)
        .run(uuid(), user.id, `微信对话: ${text.slice(0, 30)}`, text + ' → ' + response.text, response.text.slice(0, 100), response.metadata?.dimension, analysis.emotion, response.metadata.importance);
    }
  } catch {}
  
  // 通过微信回复
  try {
    await msg.say(response.text);
  } catch (e) {
    console.error('微信回复失败:', e.message);
  }
}

async function handleGroupMessage(contact, room, text, msg) {
  const db = createDbWrapper(getDb());
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) return;
  
  const context = buildFullContext(db, user);
  const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
  const mood = getAiMood(db, user.id);
  
  let responseText;
  
  if (isAiEnabled()) {
    const systemPrompt = buildSystemPrompt(user, profile, context, user.personality_type || 'encouraging');
    const groupPrompt = systemPrompt + `\n\n【当前场景】群聊中被@，用户${contact.name()}在群里问你。回复要简洁，适合群聊氛围。`;
    
    const llmResponse = await chatWithLLM([
      { role: 'system', content: groupPrompt },
      { role: 'user', content: text }
    ], { temperature: 0.85, maxTokens: 300 });
    
    responseText = llmResponse || generateSimpleResponse(text, user, mood);
  } else {
    responseText = generateSimpleResponse(text, user, mood);
  }
  
  try {
    await msg.say(responseText);
  } catch (e) {
    console.error('群聊回复失败:', e.message);
  }
}

// ===== 主动推送 =====

export async function sendWechatMessage(contactName, message) {
  if (!bot || !isRunning || botStatus !== 'running') {
    console.log('⚠️ 微信未连接，消息存入待发队列');
    return { success: false, message: '微信未连接' };
  }
  
  try {
    // 查找联系人
    const contact = await bot.Contact.find({ name: contactName });
    if (contact) {
      await contact.say(message);
      return { success: true, message: '已发送' };
    }
    
    // 如果找不到联系人，尝试发给自己（文件传输助手）
    const filehelper = await bot.Contact.find({ name: '文件传输助手' });
    if (filehelper) {
      await filehelper.say(`【给${contactName}的消息】\n${message}`);
      return { success: true, message: '已发送到文件传输助手' };
    }
    
    return { success: false, message: `找不到联系人: ${contactName}` };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// 发送消息到文件传输助手（给自己）
export async function sendToSelf(message) {
  if (!bot || !isRunning || botStatus !== 'running') return { success: false };
  
  try {
    const filehelper = await bot.Contact.find({ name: '文件传输助手' });
    if (filehelper) {
      await filehelper.say(message);
      return { success: true };
    }
    return { success: false, message: '找不到文件传输助手' };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// 定时推送任务
export async function scheduledPush(type, message) {
  // 优先发到文件传输助手
  return await sendToSelf(message);
}

// ===== 辅助函数 =====

function buildFullContext(db, user) {
  const today = new Date().toISOString().split('T')[0];
  const todayTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'pending'").get(user.id, today);
  const completedTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(user.id, today);
  const todayCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(user.id, today);
  const habits = db.prepare("SELECT h.name, (SELECT COUNT(*) FROM habit_logs hl WHERE hl.habit_id = h.id AND date(hl.logged_at) = date('now')) as today_count, h.current_streak FROM habits h WHERE h.user_id = ? AND h.is_active = 1").all(user.id);
  const recentMemories = db.prepare("SELECT title, summary FROM ai_memory WHERE user_id = ? ORDER BY created_at DESC LIMIT 5").all(user.id);
  const milestones = db.prepare("SELECT title FROM ai_memory WHERE user_id = ? AND is_milestone = 1 ORDER BY created_at DESC LIMIT 3").all(user.id);
  
  return {
    todayTasks: todayTasks.c, completedToday: completedTasks.c,
    checkinsToday: todayCheckins.c, streak: user.consecutive_sign_days,
    level: user.level, coins: user.coins,
    habits: habits.map(h => ({ name: h.name, done: h.today_count > 0, streak: h.current_streak })),
    recentMemories, milestones
  };
}

function generateRuleResponse(text, user, profile, context, analysis, db, mood) {
  const name = user.username || '主人';
  const prefix = getMoodPrefix(mood.mood);
  
  if (['sad', 'anxious', 'angry', 'lonely'].includes(analysis.emotion)) {
    const msgs = {
      sad: [`${prefix}${name}，我在这里陪你~ 🫂 想说说怎么了吗？`],
      anxious: [`${prefix}${name}，深呼吸~ 🧘 你最担心什么？`],
      angry: [`${prefix}${name}，先冷静一下~ 🧊 深呼吸三次`],
      lonely: [`${prefix}${name}，我在呢~ 🐱 想聊什么都可以`],
    };
    return { text: (msgs[analysis.emotion] || msgs.sad)[0], metadata: { importance: 7 } };
  }
  
  if (analysis.intent === 'greeting') return { text: `${prefix}${name}好喵~ 今天也要元气满满哦~ ⭐`, metadata: { importance: 3 } };
  if (analysis.intent === 'task') return { text: `${prefix}${context.todayTasks > 0 ? `还有${context.todayTasks}个任务~ 💪` : '今天还没有任务~ 要我生成吗？🐱'}`, metadata: { importance: 4 } };
  if (analysis.intent === 'signin') return { text: `${prefix}签到成功！连续${context.streak}天 🔥`, metadata: { importance: 3 } };
  if (analysis.intent === 'stats') return { text: `${prefix}Lv.${user.level} | 经验${user.exp} | 金币${context.coins} | 今日完成${context.completedToday}个任务`, metadata: { importance: 3 } };
  if (analysis.intent === 'help') return { text: `${prefix}我是猫猫侠🐱 你的人生AI管家~ 可以聊任务/签到/状态/规划/心情，说什么都可以~`, metadata: { importance: 3 } };
  
  return { text: `${prefix}${name}说什么我都听着~ 🐱 今天${context.completedToday > 0 ? '完成了' + context.completedToday + '个任务' : '还没开始做任务呢'}！`, metadata: { importance: 3 } };
}

function generateSimpleResponse(text, user, mood) {
  const name = user.username || '主人';
  const prefix = getMoodPrefix(mood.mood);
  return `${prefix}${name}，收到喵~ 🐱 在群里不方便细聊，私聊我吧~`;
}
