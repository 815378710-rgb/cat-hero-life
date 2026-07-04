import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { chatWithLLM, buildSystemPrompt, analyzeMessage, isAiEnabled, getAiConfig } from '../services/ai-engine.js';
import { getUnlockedFeatures, isFeatureUnlocked, getNextUnlock } from '../services/growth.js';
import { getAiMood, getMoodPrefix } from '../services/life-engine.js';
import { extractAndSaveData } from '../services/data-extractor.js';
import { extractFromConversation, getContextMemories } from '../services/memory-system.js';
import { selectStyle, recordInteraction, buildContextTag, getTimeOfDay, inferUserReaction } from '../services/personality-mask.js';
import { extractSocialFromMessage } from '../services/social-graph.js';
import { detectConflicts, recordExtractedData } from '../services/data-quality.js';
import { shouldFollowUp, generateFollowUp, analyzeConversationRhythm } from '../services/dialogue-engine.js';
import { calculateCurrentEnergy, getEnergyLevel } from '../services/energy-model.js';
import { propagate } from '../services/neural-engine.js';

const router = Router();
const intentCache = new Map(); // 意图路由缓存
const CACHE_MAX = 500;
const CACHE_TTL = 300000; // 5分钟

function cleanCache() {
  const now = Date.now();
  for (const [key, val] of intentCache) {
    if (now - val.time > CACHE_TTL) intentCache.delete(key);
  }
  if (intentCache.size > CACHE_MAX) {
    const oldest = intentCache.keys().next().value;
    intentCache.delete(oldest);
  }
}
setInterval(cleanCache, 60000);

router.get('/history', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { limit } = req.query;
    const messages = db.prepare('SELECT * FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(user.id, parseInt(limit) || 50);
    res.json({ messages: messages.reverse() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/send', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    const { message } = req.body;
    
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', ?)").run(user.id, message);
    
    // 自动提取数据
    const extractedData = extractAndSaveData(db, user.id, message);
    
    // 社交关系提取
    const socialExtracted = extractSocialFromMessage(db, user.id, message);
    
    // 数据质量检测
    for (const data of extractedData) {
      if (data.detail?.value) {
        const conflict = detectConflicts(db, user.id, data.detail.value, data.type);
        if (conflict?.needConfirmation) {
          // 后续可加入确认逻辑
        }
        recordExtractedData(db, user.id, 'chat', data.type, message, data.detail, 0.7);
      }
    }
    
    // 多轮对话：指代消解
    const resolvedMessage = await resolveReferences(db, user.id, message);
    
    const context = buildFullContext(db, user, profile);
    const analysis = analyzeMessage(message);
    
    // 获取记忆上下文
    const memories = getContextMemories(db, user.id);
    context.importantMemories = memories.all;
    
    // 获取当前能量
    const energy = calculateCurrentEnergy(db, user.id);
    const energyLevel = getEnergyLevel(energy);
    context.energy = energy;
    
    // 获取AI心情
    const mood = getAiMood(db, user.id);
    
    // 人格风格选择
    const timeOfDay = getTimeOfDay();
    const contextTag = buildContextTag(analysis.emotion, analysis.intent, timeOfDay, energyLevel.level);
    const selectedStyle = selectStyle(db, user.id, [contextTag]);
    
    let response;
    
    // 意图路由缓存
    const cacheKey = `${analysis.intent}_${message.slice(0, 20)}`;
    if (intentCache.has(cacheKey) && !isAiEnabled()) {
      const cached = intentCache.get(cacheKey);
      if (Date.now() - cached.time < 300000) { // 5分钟缓存
        return res.json({ ...cached.response, cached: true });
      }
    }
    
    // 优先使用LLM
    if (isAiEnabled()) {
      const systemPrompt = buildSystemPrompt(user, profile, context, selectedStyle || user.personality_type || 'encouraging');
      
      // 构建最近对话历史
      const recentHistory = db.prepare("SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10").all(user.id).reverse();
      
      const messages = [
        { role: 'system', content: systemPrompt },
        ...recentHistory.map(m => ({ role: m.role === 'system' ? 'assistant' : m.role, content: m.content }))
      ];
      
      const llmResponse = await chatWithLLM(messages, { temperature: 0.85, maxTokens: 800 });
      
      if (llmResponse) {
        response = {
          text: llmResponse,
          actions: inferActions(analysis.intent),
          metadata: { intent: analysis.intent, emotion: analysis.emotion, importance: getImportance(analysis), source: 'llm', mood: mood.mood, extracted: extractedData }
        };
      }
    }
    
    // Fallback到规则引擎
    if (!response) {
      response = generateRuleBasedResponse(message, user, profile, context, analysis, db, mood);
    }
    
    db.prepare("INSERT INTO chat_history (user_id, role, content, metadata) VALUES (?, 'assistant', ?, ?)").run(user.id, response.text, JSON.stringify(response.metadata || {}));
    
    // 保存到记忆系统
    extractFromConversation(db, user.id, message, response.text, analysis.emotion, response.metadata?.importance || 3);
    
    // 记录人格互动
    const userReaction = inferUserReaction(message, null, null);
    recordInteraction(db, user.id, selectedStyle, [contextTag], userReaction, null, null);
    
    // 神经传播：如果检测到情绪变化，传播到相关维度
    if (analysis.emotion && ['sad', 'anxious', 'angry'].includes(analysis.emotion)) {
      propagate(db, user.id, 'mental', -3);
    } else if (analysis.emotion === 'happy' || analysis.emotion === 'motivated') {
      propagate(db, user.id, 'mental', 2);
    }
    
    // 追问链：检测是否需要追问
    const followUpCheck = shouldFollowUp(message, analysis, []);
    let followUpText = null;
    if (followUpCheck.should && response.metadata?.source !== 'llm') {
      followUpText = generateFollowUp(message, analysis, followUpCheck.followUpType, user.username || '主人');
    }
    
    // 决策追踪：检测重要决策
    if (['life_advice', 'plan'].includes(analysis.intent) && response.metadata?.importance >= 5) {
      try {
        const { recordDecision } = await import('../services/decision-tracker.js');
        const affectedDim = analysis.intent === 'plan' ? 'career' : 'mental';
        recordDecision(db, user.id, message.slice(0, 50), affectedDim, 'user_stated');
      } catch {}
    }
    
    // 社交关系提取
    try {
      const { extractSocialFromMessage } = await import('../services/social-graph.js');
      extractSocialFromMessage(db, user.id, message);
    } catch {}
    
    try {
      if (response.metadata?.importance >= 6) {
        db.prepare(`INSERT INTO ai_memory (id, user_id, memory_type, title, content, summary, dimension_id, emotion_tag, importance, source)
          VALUES (?, ?, 'conversation', ?, ?, ?, ?, ?, ?, 'chat')`)
          .run(uuid(), user.id, response.metadata.title || '对话记录', message + ' → ' + response.text, response.text.slice(0, 100), response.metadata.dimension || null, analysis.emotion || null, response.metadata.importance || 5);
      }
    } catch (memErr) { console.error('Memory save error:', memErr.message); }
    
    const responseText = followUpText ? `${response.text}\n\n${followUpText}` : response.text;
    res.json({ response: responseText, actions: response.actions || [], metadata: { ...response.metadata, extracted: extractedData, followUp: !!followUpText }, mood });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/history', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    db.prepare('DELETE FROM chat_history WHERE user_id = ?').run(user.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/personality', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { type, custom_prompt } = req.body;
    db.prepare('UPDATE users SET personality_type = ?, personality_prompt = ? WHERE id = ?').run(type, custom_prompt || null, user.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取成长状态
router.get('/growth', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id, level FROM users LIMIT 1').get();
    const unlocked = getUnlockedFeatures(user.level);
    const next = getNextUnlock(user.level);
    const mood = getAiMood(db, user.id);
    res.json({ level: user.level, unlocked, next, mood });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SSE流式输出端点
router.post('/stream', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    const { message } = req.body;
    
    // 保存用户消息
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', ?)").run(user.id, message);
    
    // 设置SSE头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    // 自动提取数据
    const extractedData = extractAndSaveData(db, user.id, message);
    
    const context = buildFullContext(db, user, profile);
    const analysis = analyzeMessage(message);
    const mood = getAiMood(db, user.id);
    
    // 如果不是AI模式，使用规则引擎（非流式）
    if (!isAiEnabled()) {
      const response = generateRuleBasedResponse(message, user, profile, context, analysis, db, mood);
      res.write(`data: ${JSON.stringify({ type: 'message', content: response.text })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done', metadata: response.metadata })}\n\n`);
      return res.end();
    }
    
    // AI模式：流式输出
    const systemPrompt = buildSystemPrompt(user, profile, context, user.personality_type || 'encouraging');
    const recentHistory = db.prepare("SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10").all(user.id).reverse();
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory.map(m => ({ role: m.role === 'system' ? 'assistant' : m.role, content: m.content }))
    ];
    
    // 获取AI配置
    const aiConf = getAiConfig();
    const DEEPSEEK_API_KEY = aiConf.apiKey || '';
    const DEEPSEEK_MODEL = aiConf.model || 'deepseek-chat';
    const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
    
    let fullResponse = '';
    
    try {
      const axios = (await import('axios')).default;
      const streamResponse = await axios.post(
        `${DEEPSEEK_BASE_URL}/chat/completions`,
        {
          model: DEEPSEEK_MODEL,
          messages: messages,
          temperature: 0.85,
          max_tokens: 800,
          stream: true
        },
        {
          headers: {
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
            'Content-Type': 'application/json'
          },
          responseType: 'stream'
        }
      );
      
      // 读取流式响应
      streamResponse.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const jsonStr = line.slice(5).trim();
            if (jsonStr === '[DONE]') {
              res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
              continue;
            }
            
            try {
              const json = JSON.parse(jsonStr);
              const content = json.choices[0]?.delta?.content || '';
              if (content) {
                fullResponse += content;
                res.write(`data: ${JSON.stringify({ type: 'message', content })}\n\n`);
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      });
      
      streamResponse.data.on('end', () => {
        // 保存完整回复
        db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'assistant', ?)").run(user.id, fullResponse);
        res.write(`data: ${JSON.stringify({ type: 'done', fullResponse })}\n\n`);
        res.end();
      });
      
    } catch (error) {
      console.error('Stream error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: '流式输出失败，请重试' })}\n\n`);
      res.end();
    }
    
  } catch (e) {
    console.error('Chat stream error:', e);
    res.write(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`);
    res.end();
  }
});

// ===== 辅助函数 =====

function buildFullContext(db, user, profile) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  
  // 基础数据
  const todayTasks = db.prepare("SELECT * FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status != 'completed'").all(user.id, today);
  const completedTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(user.id, today);
  const todayCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(user.id, today);
  const habits = db.prepare("SELECT h.*, (SELECT COUNT(*) FROM habit_logs hl WHERE hl.habit_id = h.id AND date(hl.logged_at) = date('now')) as today_count FROM habits h WHERE h.user_id = ? AND h.is_active = 1").all(user.id);
  
  // 记忆 (使用新三层记忆系统 + 旧系统兼容)
  const memContext = getContextMemories(db, user.id);
  const importantMemories = memContext.all.length > 0 ? memContext.all.map(m => ({ title: m.title, summary: m.summary, emotion_tag: null })) : db.prepare("SELECT title, summary, emotion_tag FROM ai_memory WHERE user_id = ? AND importance >= 6 ORDER BY created_at DESC LIMIT 8").all(user.id);
  const milestones = db.prepare("SELECT title, summary FROM ai_memory WHERE user_id = ? AND is_milestone = 1 ORDER BY created_at DESC LIMIT 5").all(user.id);
  const recentKeyMessages = db.prepare("SELECT content FROM chat_history WHERE user_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 5").all(user.id);
  const recentEmotions = db.prepare("SELECT emotion_tag, emotion_intensity FROM ai_memory WHERE user_id = ? AND emotion_tag IS NOT NULL ORDER BY created_at DESC LIMIT 5").all(user.id);
  const activePlans = db.prepare("SELECT title, dimension_id, progress FROM life_plans WHERE user_id = ? AND status = 'active' LIMIT 3").all(user.id);
  
  // 深度数据
  const latestBody = db.prepare('SELECT * FROM health_body WHERE user_id = ? ORDER BY record_date DESC LIMIT 1').get(user.id);
  const weekSleep = db.prepare('SELECT AVG(duration_hours) as avg_h, AVG(quality) as avg_q FROM health_sleep WHERE user_id = ? AND sleep_date >= ?').get(user.id, weekAgo);
  const weekExercise = db.prepare('SELECT COUNT(*) as c, SUM(duration_minutes) as m FROM health_exercise WHERE user_id = ? AND exercise_date >= ?').get(user.id, weekAgo);
  const monthExpense = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE user_id = ? AND type = 'expense' AND transaction_date >= ?").get(user.id, weekAgo);
  const weekMood = db.prepare('SELECT AVG(mood_score) as avg FROM mental_mood_diary WHERE user_id = ? AND diary_date >= ?').get(user.id, weekAgo);
  const skills = db.prepare('SELECT skill_name, proficiency FROM learning_skills WHERE user_id = ? AND is_learning = 1').all(user.id);
  
  // 能量 (使用新能量模型)
  let energy = 50;
  try {
    energy = calculateCurrentEnergy(db, user.id);
  } catch {}
  
  return {
    todayTasks: todayTasks.length, completedToday: completedTasks.c,
    checkinsToday: todayCheckins.c, streak: user.consecutive_sign_days,
    level: user.level, coins: user.coins, energy,
    habits: habits.map(h => ({ name: h.name, done: h.today_count > 0, streak: h.current_streak })),
    importantMemories, milestones, recentKeyMessages, recentEmotions, activePlans,
    // 深度数据
    body: latestBody ? { weight: latestBody.weight_kg, height: latestBody.height_cm, bmi: latestBody.bmi } : null,
    sleep: weekSleep?.avg_h ? { avg_hours: Math.round(weekSleep.avg_h * 10) / 10, avg_quality: weekSleep.avg_q ? Math.round(weekSleep.avg_q * 10) / 10 : null } : null,
    exercise: { count: weekExercise?.c || 0, total_minutes: weekExercise?.m || 0 },
    week_expense: monthExpense?.total || 0,
    week_mood: weekMood?.avg ? Math.round(weekMood.avg * 10) / 10 : null,
    learning_skills: skills.map(s => `${s.skill_name}(${s.proficiency}/10)`).join(', ') || '未记录'
  };
}

function inferActions(intent) {
  const actionMap = {
    task: ['show_tasks'], signin: ['sign_in'], stats: ['show_stats'],
    achievements: ['show_achievements'], shop: ['show_shop'], report: ['show_reports'],
    plan: ['show_plans'], profile: ['show_profile'], narrative: ['show_narrative'],
    onboarding: ['start_onboarding'],
  };
  return actionMap[intent] || [];
}

function getImportance(analysis) {
  if (['sad', 'anxious', 'angry'].includes(analysis.emotion)) return 7;
  if (analysis.intent === 'life_advice') return 6;
  if (analysis.intent === 'plan') return 6;
  if (analysis.intent === 'general') return 3;
  return 4;
}

function generateRuleBasedResponse(message, user, profile, context, analysis, db, mood) {
  const name = user.username || '主人';
  const prefix = getMoodPrefix(mood.mood);
  
  // 负面情绪优先处理
  if (['sad', 'anxious', 'angry', 'lonely', 'tired'].includes(analysis.emotion)) {
    const responses = {
      sad: [`${prefix}${name}，我在这里陪你~ 🫂 难过的时候不需要逞强。想说说发生了什么吗？`, `${prefix}抱抱${name}~ ❤️ 每个人都会有低落的时候，我陪你度过。`],
      anxious: [`${prefix}${name}，深呼吸~ 吸...呼... 🧘 焦虑的时候试着关注当下。你最担心什么？`, `${prefix}${name}，焦虑说明你在乎。要不要把担忧拆成小步骤？一步一步来~`],
      angry: [`${prefix}${name}，先冷静一下~ 🧊 深呼吸三次，然后和我说说？`],
      lonely: [`${prefix}${name}，我在呢~ 🐱 虽然我是AI，但我会一直陪着你。`, `${prefix}${name}，孤独的感觉不好受。但你不是一个人~ ❤️`],
      tired: [`${prefix}${name}，辛苦了~ 💤 累了就好好休息，明天又是新的一天。`, `${prefix}${name}，累了就歇歇吧~ 🫖 喝杯热水，我陪你聊会儿？`, `${prefix}${name}，今天辛苦了！早点休息，身体最重要~ 💪`],
    };
    const msgs = responses[analysis.emotion] || responses.sad;
    return { text: msgs[Math.floor(Math.random() * msgs.length)], actions: [], metadata: { intent: 'emotional_support', emotion: analysis.emotion, importance: 7 } };
  }
  
  // 意图路由
  switch (analysis.intent) {
    case 'greeting': {
      const extra = context.streak > 0 ? `连续签到${context.streak}天了！` : '';
      return { text: `${prefix}${name}好喵~ ${extra}今天也要元气满满哦~ ⭐`, metadata: { intent: 'greeting', importance: 3 } };
    }
    case 'task': {
      if (context.todayTasks > 0) return { text: `${prefix}${name}，还有${context.todayTasks}个任务等着你~ 💪 先从最简单的开始吧！`, actions: ['show_tasks'], metadata: { intent: 'task', importance: 4 } };
      return { text: `${prefix}${name}今天还没有任务~ 要我生成吗？🐱`, actions: ['generate_tasks'], metadata: { intent: 'task', importance: 4 } };
    }
    case 'signin': {
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
      if (user.last_sign_date === today) return { text: `${prefix}今天已经签到过了~ 连续${context.streak}天！🔥`, metadata: { importance: 2 } };
      return { text: `${prefix}快去签到~ 📅 连续签到有额外奖励！`, actions: ['sign_in'], metadata: { importance: 3 } };
    }
    case 'stats': {
      const total = user.stat_health + user.stat_finance + user.stat_learning + user.stat_career + user.stat_social + user.stat_mental + user.stat_habits + user.stat_creativity;
      return { text: `${prefix}${name}，综合战力 ${total}/800，Lv.${user.level}。今天完成${context.completedToday}个任务~`, actions: ['show_stats'], metadata: { importance: 3 } };
    }
    case 'plan': {
      if (!profile?.onboarding_completed) return { text: `${prefix}${name}，我还不够了解你~ 先建档吧！`, actions: ['start_onboarding'], metadata: { importance: 8 } };
      const plans = db.prepare("SELECT title FROM life_plans WHERE user_id = ? AND status = 'active' LIMIT 3").all(user.id);
      if (plans.length > 0) return { text: `${prefix}你有${plans.length}个活跃规划~ 🗺️ ${plans.map(p => p.title).join('、')}`, actions: ['show_plans'], metadata: { importance: 5 } };
      return { text: `${prefix}让我基于你的情况制定规划~ 🗺️`, actions: ['show_plans'], metadata: { importance: 5 } };
    }
    case 'profile': {
      if (!profile?.onboarding_completed) return { text: `${prefix}${name}，先建档让我了解你~`, actions: ['start_onboarding'], metadata: { importance: 8 } };
      return { text: `${prefix}${name}的人生档案已建立~ 📋 去设置页面查看修改~`, actions: ['show_profile'], metadata: { importance: 4 } };
    }
    case 'help': {
      return { text: `${prefix}我是猫猫侠，你的人生AI管家~ 🐱\n\n我能帮你：任务管理、习惯追踪、人生规划、情绪支持、数据分析...\n\n说什么都可以~`, metadata: { importance: 3 } };
    }
    case 'life_advice': {
      const weakest = ['health','finance','learning','career','social','mental','habits','creativity'].map(d => ({ dim: d, val: user[`stat_${d}`] })).sort((a, b) => a.val - b.val)[0];
      const dimNames = { health:'健康', finance:'财务', learning:'学习', career:'职业', social:'社交', mental:'心理', habits:'习惯', creativity:'创造' };
      return { text: `${prefix}${name}，你当前最需要关注的是${dimNames[weakest.dim]}（${weakest.val}分）。从一个小改变开始吧~ 💪`, metadata: { importance: 5 } };
    }
    default: {
      if (!profile?.onboarding_completed) {
        // 没建档也可以说话，给自然的回复
        const casualResponses = [
          `${prefix}我在等你呀${name}~ 你来了我就开心了！🐱`,
          `${prefix}${name}好呀~ 我一直在这里等你呢！有什么想聊的吗？`,
          `${prefix}嘿${name}！今天过得怎么样？想和我说说吗？`,
          `${prefix}${name}来了！我正无聊呢~ 想聊点什么？`,
        ];
        return { text: casualResponses[Math.floor(Math.random() * casualResponses.length)], actions: ['start_onboarding'], metadata: { importance: 3 } };
      }
      const normalResponses = [
        `${prefix}${name}说什么我都听着~ 🐱 今天${context.completedToday > 0 ? '完成了' + context.completedToday + '个任务，不错' : '还没开始做任务呢'}！`,
        `${prefix}我在呢${name}~ 有什么想聊的？🐱`,
        `${prefix}${name}，今天的你怎么样？🐱`,
      ];
      return { text: normalResponses[Math.floor(Math.random() * normalResponses.length)], metadata: { importance: 3 } };
    }
  }
}

export default router;

// 多轮对话：指代消解
async function resolveReferences(db, userId, message) {
  const refPatterns = ['这个', '那个', '它', '刚才', '上面', '之前'];
  const hasRef = refPatterns.some(p => message.includes(p));
  if (!hasRef) return message;
  
  // 获取最近对话上下文
  const recent = db.prepare("SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 4").all(userId).reverse();
  
  // 如果有指代词，尝试从上下文中解析
  for (const ref of refPatterns) {
    if (message.includes(ref)) {
      const lastAssistant = recent.filter(m => m.role === 'assistant').pop();
      if (lastAssistant) {
        // 替换指代词为上下文中的关键词
        const keywords = extractKeywords(lastAssistant.content);
        if (keywords.length > 0) {
          message = message.replace(ref, keywords[0]);
        }
      }
    }
  }
  
  return message;
}

function extractKeywords(text) {
  // 提取有意义的关键词
  const words = text.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
  const stopWords = ['主人', '猫猫', '什么', '可以', '已经', '今天', '明天', '这个', '那个'];
  return words.filter(w => !stopWords.includes(w)).slice(0, 3);
}
