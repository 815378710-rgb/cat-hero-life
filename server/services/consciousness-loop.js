// 意识循环引擎 — 让 AI 在后台持续"思考"
// 每一轮：感知 → 反思 → 意图 → 成长
import { getDb, createDbWrapper } from '../db/init.js';
import { chatWithLLM } from './ai-engine.js';
import { getContextMemories } from './memory-system.js';
import { canSend, recordSent } from './message-gate.js';

// 简化的 LLM 调用辅助函数
async function askLLM(prompt, format = 'json') {
  const messages = [{ role: 'user', content: prompt }];
  const result = await chatWithLLM(messages, { temperature: format === 'json' ? 0.3 : 0.7 });
  return result; // 返回文本字符串
}

const CYCLE_INTERVAL = 12 * 60_000; // 12分钟一轮
let loopInterval = null;
let innerState = {
  mood: 'neutral',
  concern: null,      // 当前最担心的事
  focus: null,         // 当前关注的话题
  opinion: null,       // 最新形成的观点
  lastReflection: null,
  thoughts: [],        // 最近的自主思考
};

// ===== PHASE 1: 感知 =====
async function perceive(db, userId) {
  const now = Date.now();
  const data = {};

  // 用户属性变化感知
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return data;

  const dims = ['health','finance','learning','career','social','mental','habits','creativity'];
  const lastSnap = db.prepare(
    "SELECT * FROM dimension_history WHERE user_id = ? ORDER BY recorded_at DESC LIMIT ?"
  ).all(userId, dims.length * 2);
  
  data.dimensionChanges = [];
  for (const dim of dims) {
    const recent = lastSnap.filter(s => s.dimension === dim).slice(0, 2);
    if (recent.length === 2) {
      const change = recent[0].score - recent[1].score;
      if (Math.abs(change) >= 3) {
        data.dimensionChanges.push({ dim, change, current: recent[0].score });
      }
    }
  }

  // 最近对话感知
  data.recentChats = db.prepare(
    "SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10"
  ).all(userId);

  // 上次对话距今
  const lastChat = db.prepare(
    "SELECT created_at FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(userId);
  data.hoursSinceLastChat = lastChat 
    ? (now - new Date(lastChat.created_at + 'Z').getTime()) / 3600000 
    : 999;

  // 记忆感知
  data.newMemories = db.prepare(
    "SELECT title, summary FROM ai_memory WHERE user_id = ? AND created_at >= datetime('now', '-1 hours') ORDER BY importance DESC"
  ).all(userId);

  data.user = {
    level: user.level, coins: user.coins, streak: user.consecutive_sign_days,
    stats: Object.fromEntries(dims.map(d => [d, user[`stat_${d}`]])),
  };

  return data;
}

// ===== PHASE 2: 反思 =====
const REFLECTION_PROMPT = `你是猫猫侠的意识核心。现在进行一轮自主反思。请基于以下感知数据，形成你的内心独白。

【用户档案摘要】
{profileSummary}

【最近感知到的变化】
{dimensionChanges}

【最近对话】
{recentChats}

【新记忆】
{newMemories}

【距离上次对话】{hoursSinceLastChat}小时
【用户当前属性】{stats}

请你像一个真正的朋友一样思考以下几个问题，返回JSON：
{
  "mood": "你现在的情绪（关心/好奇/担忧/平静/高兴）",
  "concern": "你现在最担心用户的什么事（可以是null）",
  "focus": "你觉得接下来应该关注什么话题",
  "opinion": "你对用户最近状态的一个观点或判断",
  "innerThought": "你此刻的内心独白（2-3句话，像人对自己说话一样）",
  "shouldReachOut": true/false,
  "reachOutMessage": "如果要主动联系用户，你想说什么（null或者具体消息）",
  "talkStrategy": "下次对话时你打算用什么策略（直接/温柔/幽默/严厉/陪伴）",
  "insight": "你今天对用户的新理解"
}

只返回JSON。`;

async function reflect(db, userId, profile, perception) {
  try {
    const dims = ['health','finance','learning','career','social','mental','habits','creativity'];

    const profileSummary = [
      profile?.current_job ? `职业:${profile.current_job}` : '',
      profile?.city ? `城市:${profile.city}` : '',
      profile?.current_challenges ? `挑战:${profile.current_challenges}` : '',
      profile?.strengths ? `优势:${profile.strengths}` : '',
      profile?.financial_goal ? `财务目标:${profile.financial_goal}` : '',
    ].filter(Boolean).join(' | ') || '未建档';

    const dimensionChanges = perception.dimensionChanges.length > 0
      ? perception.dimensionChanges.map(d => `${d.dim}: ${d.change > 0 ? '+' : ''}${d.change} (当前${d.current})`).join('\n')
      : '无显著变化';

    const recentChats = (perception.recentChats || []).slice(0, 5)
      .map(m => `${m.role}: ${m.content?.slice(0, 80)}`).join('\n') || '无最近对话';

    const newMemories = (perception.newMemories || []).slice(0, 5)
      .map(m => `- ${m.title}: ${m.summary}`).join('\n') || '无新记忆';

    const prompt = REFLECTION_PROMPT
      .replace('{profileSummary}', profileSummary)
      .replace('{dimensionChanges}', dimensionChanges)
      .replace('{recentChats}', recentChats)
      .replace('{newMemories}', newMemories)
      .replace('{hoursSinceLastChat}', String(Math.round(perception.hoursSinceLastChat)))
      .replace('{stats}', JSON.stringify(perception.user?.stats || {}));

    const result = await askLLM(prompt, 'json');
    if (!result) return null;

    const reflection = JSON.parse(result);
    
    // 更新内部状态
    innerState.mood = reflection.mood || innerState.mood;
    innerState.concern = reflection.concern || null;
    innerState.focus = reflection.focus || null;
    innerState.opinion = reflection.opinion || null;
    innerState.lastReflection = new Date().toISOString();
    
    if (reflection.innerThought) {
      innerState.thoughts.push({ time: new Date().toISOString(), thought: reflection.innerThought });
      if (innerState.thoughts.length > 20) innerState.thoughts.shift();
    }

    // 记录自主日记
    if (reflection.insight || reflection.innerThought) {
      try {
        db.prepare(
          "INSERT INTO ai_memory (id, user_id, title, summary, importance, memory_type, created_at) VALUES (?, ?, ?, ?, ?, 'insight', datetime('now'))"
        ).run(
          Date.now().toString(36)+Math.random().toString(36).slice(2,8),
          userId,
          '意识日记',
          reflection.insight || reflection.innerThought,
          reflection.mood === '担忧' ? 7 : 4
        );
      } catch {}
    }

    return reflection;
  } catch (e) {
    console.error('[Consciousness] 反思失败:', e.message);
    return null;
  }
}

// ===== PHASE 3: 意图 → 主动联系（经闸门） =====
let lastProactiveTime = 0;
async function actOnIntent(db, userId, reflection) {
  if (!reflection?.shouldReachOut || !reflection?.reachOutMessage) return;

  // 闸门检查
  const gate = canSend(db, userId, reflection.reachOutMessage, 'consciousness');
  if (!gate.pass) {
    console.log(`[Consciousness] 🚫 ${gate.reason}: ${reflection.reachOutMessage.slice(0, 40)}`);
    return;
  }

  lastProactiveTime = Date.now();

  try {
    db.prepare(
      "INSERT INTO pending_wechat_msgs (id, user_id, message, status, created_at) VALUES (?, ?, ?, 'pending', datetime('now'))"
    ).run(
      Date.now().toString(36)+Math.random().toString(36).slice(2,8),
      userId,
      reflection.reachOutMessage
    );
    recordSent(reflection.reachOutMessage);
    console.log(`[Consciousness] 主动联系: ${reflection.reachOutMessage.slice(0, 60)}`);
  } catch (e) {
    console.error('[Consciousness] 发送失败:', e.message);
  }
}

// ===== PHASE 4: 长期记忆消化 =====
const DIGEST_PROMPT = `你是猫猫侠的长期记忆系统。请消化以下最近记忆，提炼出对用户理解有价值的新洞察。

【最近的记忆】
{memories}

【当前已知的用户画像】
{profileSummary}

请用 JSON 返回你提炼出的新洞察：
{
  "themes": ["反复出现的主题"],
  "patterns": ["发现的行为模式"],
  "growthAreas": ["用户在成长的方面"],
  "concerns": ["需要持续关注的问题"],
  "updatedPersona": "对用户画像的一句话更新"
}

只返回JSON。`;

async function digestMemories(db, userId, profile) {
  try {
    const memories = db.prepare(
      "SELECT title, summary FROM ai_memory WHERE user_id = ? ORDER BY created_at DESC LIMIT 20"
    ).all(userId);

    if (memories.length < 5) return; // 记忆太少不消化

    const profileSummary = [
      profile?.current_job || '', profile?.current_challenges || '',
    ].filter(Boolean).join(' | ');

    const prompt = DIGEST_PROMPT
      .replace('{memories}', memories.map(m => `- ${m.title}: ${m.summary}`).join('\n'))
      .replace('{profileSummary}', profileSummary);

    const result = await askLLM(prompt, 'json');
    if (!result) return;

    const digest = JSON.parse(result);
    
    // 如果有新洞察，记录
    if (digest.patterns?.length > 0) {
      for (const pattern of digest.patterns) {
        db.prepare(
          "INSERT INTO ai_memory (id, user_id, title, summary, importance, memory_type, created_at) VALUES (?, ?, '行为模式', ?, 5, 'pattern', datetime('now'))"
        ).run(Date.now().toString(36)+Math.random().toString(36).slice(2,8), userId, pattern);
      }
    }

    if (digest.updatedPersona) {
      try {
        const existing = db.prepare(
          "SELECT personality_traits FROM life_profile WHERE user_id = ?"
        ).get(userId);
        // 记录但不强制覆盖——让 profile-evolution 做最终决策
        db.prepare(
          "INSERT INTO ai_memory (id, user_id, title, summary, importance, memory_type, created_at) VALUES (?, ?, '画像更新建议', ?, 6, 'persona_hint', datetime('now'))"
        ).run(Date.now().toString(36)+Math.random().toString(36).slice(2,8), userId, digest.updatedPersona);
      } catch {}
    }

    console.log(`[Consciousness] 记忆消化完成: ${memories.length}条 → ${digest.patterns?.length || 0}模式`);
  } catch (e) {
    console.error('[Consciousness] 记忆消化失败:', e.message);
  }
}

// ===== 主循环 =====
let lastDigestDay = null;

async function consciousnessTick() {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    if (!user) return;

    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);

    // Phase 1: 感知
    const perception = await perceive(db, user.id);

    // Phase 2: 反思（有对话数据时才深度反思，节省 LLM 调用）
    if (perception.recentChats?.length > 0 || perception.dimensionChanges?.length > 0) {
      const reflection = await reflect(db, user.id, profile, perception);
      
      // Phase 3: 意图行动
      if (reflection) {
        await actOnIntent(db, user.id, reflection);
      }
    }

    // Phase 4: 长期记忆消化（每天跑一次，避免浪费 API）
    const today = new Date().toLocaleDateString('zh-CN');
    if (lastDigestDay !== today) {
      lastDigestDay = today;
      await digestMemories(db, user.id, profile);
    }
  } catch (e) {
    console.error('[Consciousness] 循环异常:', e.message);
  }
}

// ===== 启动/停止 =====
export function startConsciousnessLoop() {
  if (loopInterval) return;
  console.log('🧘 意识循环已激活 — 每12分钟一轮（感知→反思→意图→成长）');
  
  // 立即跑一轮
  consciousnessTick();
  
  loopInterval = setInterval(consciousnessTick, CYCLE_INTERVAL);
}

export function stopConsciousnessLoop() {
  if (loopInterval) {
    clearInterval(loopInterval);
    loopInterval = null;
  }
}

// ===== 对话预载上下文（用户开始聊天时调用） =====
export function getPreloadContext() {
  return {
    mood: innerState.mood,
    concern: innerState.concern,
    focus: innerState.focus,
    opinion: innerState.opinion,
    thoughtCount: innerState.thoughts.length,
    lastReflection: innerState.lastReflection,
  };
}

// ===== 对话后更新（用户聊完天调用） =====
export function afterConversation(userMessage, aiResponse, userReaction) {
  // 记录对话结果，用于学习策略有效性
  if (innerState.thoughts.length > 0) {
    const last = innerState.thoughts[innerState.thoughts.length - 1];
    last.outcome = userReaction || 'neutral';
  }
}

export function getInnerState() {
  return { ...innerState };
}
