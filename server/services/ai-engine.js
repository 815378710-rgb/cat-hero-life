// 猫猫侠 AI引擎 - 多模型适配层
// 支持: OpenAI / Claude / DeepSeek / 通义千问 / 本地模型
import { getDb } from '../db/init.js';

// 默认模型：DeepSeek-V4.1-Flash（多模态，支持图片输入，1M 上下文）
// ⚠️ 该模型默认开启推理：会先消耗 token 思考，max_tokens 给小了 content 会直接空掉，
//    因此所有调用统一把 max_tokens 抬到下限（否则前端表现为"AI 回了条空消息"）
export const DEFAULT_MODEL = 'deepseek-flash';
export const MIN_MAX_TOKENS = 4096;

// ===== 文本安全层 =====
// 背景：Node 字符串是 UTF-16。用 .slice() 按长度硬截断时，如果正好切在 emoji
// （代理对，如 🐾 = \ud83d\udc3e）中间，就会留下「孤立代理字符」\ud83d。
// 这种字符被 JSON.stringify 成 "\ud83d" 后，DeepSeek 网关解析请求体直接报
//   400 Failed to parse the request body as JSON:
//       messages[0].content: unexpected end of hex escape
// 结果就是 AI 静默失败、用户只看到兜底话术（"在呢"/"收到"）。
// 下面两个工具负责在「截断」和「出站」两个环节彻底堵死这类脏数据。

/** 去掉孤立代理字符与控制字符（保留 \t \n \r） */
export function sanitizeText(s) {
  if (typeof s !== 'string') return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF) {
      const n = s.charCodeAt(i + 1);
      if (n >= 0xDC00 && n <= 0xDFFF) { out += s[i] + s[i + 1]; i++; }
      continue;                                        // 孤立高代理 → 丢弃
    }
    if (c >= 0xDC00 && c <= 0xDFFF) continue;          // 孤立低代理 → 丢弃
    if (c < 0x20 && c !== 9 && c !== 10 && c !== 13) continue;  // 其他控制字符
    out += s[i];
  }
  return out;
}

/** 按码点安全截断，绝不切碎 emoji */
export function safeSlice(s, n) {
  if (typeof s !== 'string') return '';
  const t = sanitizeText(s);
  if (t.length <= n) return t;
  let end = n;
  const c = t.charCodeAt(end - 1);
  if (c >= 0xD800 && c <= 0xDBFF) end -= 1;            // 别把高代理留在末尾
  return t.slice(0, end);
}

/** 发送前统一清洗所有 message，彻底兜住任何来源的脏数据 */
function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map(m => {
    if (!m || typeof m !== 'object') return m;
    const o = { ...m };
    if (typeof o.content === 'string') {
      o.content = sanitizeText(o.content);
    } else if (Array.isArray(o.content)) {
      o.content = o.content.map(p =>
        (p && typeof p === 'object' && typeof p.text === 'string')
          ? { ...p, text: sanitizeText(p.text) } : p);
    }
    if (Array.isArray(o.tool_calls)) {
      o.tool_calls = o.tool_calls.map(tc => {
        if (tc?.function && typeof tc.function.arguments === 'string') {
          return { ...tc, function: { ...tc.function, arguments: sanitizeText(tc.function.arguments) } };
        }
        return tc;
      });
    }
    return o;
  });
}

export const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    headers: (key) => ({ 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }),
    buildBody: (model, messages, opts) => ({ model, messages, temperature: opts.temperature || 0.8, max_tokens: opts.maxTokens || 1024 }),
    extractResponse: (data) => data.choices?.[0]?.message?.content || ''
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: DEFAULT_MODEL,
    headers: (key) => ({ 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }),
    buildBody: (model, messages, opts) => ({
      model: model || DEFAULT_MODEL,
      messages,
      temperature: opts.temperature || 0.8,
      max_tokens: Math.max(Number(opts.maxTokens) || 0, MIN_MAX_TOKENS),
      reasoning_effort: 'high'
    }),
    extractResponse: (data) => data.choices?.[0]?.message?.content || ''
  },
  qwen: {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-turbo',
    headers: (key) => ({ 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }),
    buildBody: (model, messages, opts) => ({ model, messages, temperature: opts.temperature || 0.8, max_tokens: opts.maxTokens || 1024 }),
    extractResponse: (data) => data.choices?.[0]?.message?.content || ''
  },
  claude: {
    name: 'Claude',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-haiku-20240307',
    headers: (key) => ({ 'x-api-key': key, 'Content-Type': 'application/json', 'anthropic-version': '2023-06-01' }),
    buildBody: (model, messages, opts) => {
      const system = messages.find(m => m.role === 'system')?.content || '';
      const msgs = messages.filter(m => m.role !== 'system');
      return { model, system, messages: msgs, max_tokens: opts.maxTokens || 1024, temperature: opts.temperature || 0.8 };
    },
    extractResponse: (data) => data.content?.[0]?.text || ''
  }
};

// AI配置（固定 DeepSeek，模型统一走多模态 V4.1-Flash）
let aiConfig = {
  provider: 'deepseek',
  apiKey: process.env.AI_API_KEY || '',
  model: DEFAULT_MODEL,
  enabled: false
};

export function setAiConfig(config) {
  // 固定 Provider + 模型：全部对话统一走 DeepSeek-V4.1-Flash（多模态，可读图）
  Object.assign(aiConfig, { provider: 'deepseek', model: DEFAULT_MODEL });
  if (config.apiKey) {
    config.apiKey = config.apiKey.replace(/[^\x20-\x7E]/g, '').trim().replace(/^["']|["']$/g, '');
    aiConfig.apiKey = config.apiKey;
  }
  aiConfig.enabled = !!aiConfig.apiKey && aiConfig.apiKey.length > 5;
  console.log(`AI引擎: ${aiConfig.model} 推理模式 ${aiConfig.enabled ? '✅ 已启用' : '❌ 未配置API Key'}`);
}

export function getAiConfig() {
  return { ...aiConfig, apiKey: aiConfig.apiKey ? '***已配置***' : '未配置' };
}

// 内部使用：返回真实API Key（不掩码）
export function getRawApiKey() {
  return aiConfig.apiKey;
}

export function getRawAiConfig() {
  return { ...aiConfig };
}

export function isAiEnabled() {
  return aiConfig.enabled && !!aiConfig.apiKey;
}

// 核心：发送消息到LLM（带备用模型）
export async function chatWithLLM(messages, opts = {}) {
  // 参数防御：防止类型错误导致静默失败
  if (!Array.isArray(messages) || messages.length === 0) {
    console.error('chatWithLLM: messages 必须是非空数组，收到:', typeof messages);
    return null;
  }
  for (let i = 0; i < messages.length; i++) {
    if (!messages[i] || typeof messages[i] !== 'object') {
      console.error(`chatWithLLM: messages[${i}] 不是有效对象`);
      return null;
    }
  }
  // 尝试主模型
  const result = await tryLLM(aiConfig.provider, aiConfig.apiKey, aiConfig.model, messages, opts);
  if (result) return result;
  
  // 尝试备用模型
  if (aiConfig.fallbackApiKey) {
    console.log('主模型失败，尝试备用模型...');
    const fallbackResult = await tryLLM(aiConfig.fallbackProvider, aiConfig.fallbackApiKey, aiConfig.fallbackModel, messages, opts);
    if (fallbackResult) return fallbackResult;
  }
  
  return null;
}

// ===== Function Calling 工具定义 =====

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'lookup_memory',
      description: '搜索用户的记忆库，查找过去的对话、事件、决定。用户问"记得我之前说过什么吗"时调用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词或语义描述' },
          time_range: { type: 'string', enum: ['recent', 'week', 'month', 'all'], description: '时间范围' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_goals',
      description: '查看用户的目标和进度。用户问"我的目标怎么样了"时调用。',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['all', 'finance', 'career', 'health', 'learning'], description: '目标类别' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'log_expense',
      description: '记录一笔支出。用户说"我花了XX元买了YY"时调用。',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: '金额（元）' },
          category: { type: 'string', description: '类别：餐饮/交通/购物/娱乐/其他' },
          description: { type: 'string', description: '简短描述' }
        },
        required: ['amount']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '获取当前天气信息。用户问天气时调用。',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_stats',
      description: '查看用户的当前状态、属性、等级。用户问"我的状态"时调用。',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_reminder',
      description: '创建一个提醒。用户说"提醒我XX"时调用。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '提醒内容' },
          time: { type: 'string', description: '提醒时间，如"明天早上9点"' }
        },
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'plan_today_tasks',
      description: '为用户规划今日任务。用户说"帮我安排今天做什么"或"今天有什么建议"时调用。',
      parameters: {
        type: 'object',
        properties: {
          focus: { type: 'string', description: '重点关注的维度：health/career/finance/learning/any' }
        },
        required: []
      }
    }
  }
];

// 工具执行器
const toolExecutors = {};

export function registerToolExecutor(name, fn) {
  toolExecutors[name] = fn;
}

// Function Calling 增强版 chat
export async function chatWithTools(messages, opts = {}, db = null, userId = null) {
  if (!Array.isArray(messages) || messages.length === 0) {
    console.error('chatWithTools: messages 必须是非空数组');
    return { text: null, toolCalls: [] };
  }

  const toolCallsMade = [];
  let currentMessages = [...messages];

  // 最多 3 轮 function calling 循环
  for (let round = 0; round < 3; round++) {
    const result = await tryLLMWithTools(aiConfig.provider, aiConfig.apiKey, aiConfig.model, currentMessages, opts);
    
    if (!result) return { text: null, toolCalls: toolCallsMade };

    // 如果是文本回复
    if (result.text) {
      return { text: result.text, toolCalls: toolCallsMade };
    }

    // 如果是 tool call
    if (result.tool_calls && result.tool_calls.length > 0) {
      for (const tc of result.tool_calls) {
        const fnName = tc.function?.name;
        const fnArgs = JSON.parse(tc.function?.arguments || '{}');
        
        console.log(`LLM tool call: ${fnName}(${JSON.stringify(fnArgs).slice(0, 80)})`);
        
        let toolResult = null;
        if (toolExecutors[fnName]) {
          try {
            toolResult = await toolExecutors[fnName](fnArgs, db, userId);
          } catch (e) {
            toolResult = { error: e.message };
          }
        } else {
          toolResult = { error: `工具 ${fnName} 未注册` };
        }

        toolCallsMade.push({ name: fnName, args: fnArgs, result: toolResult });

        // 将 tool call 和结果加入消息
        currentMessages.push({
          role: 'assistant',
          content: null,
          tool_calls: [tc]
        });
        currentMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult)
        });
      }
      continue; // 下一轮，让 LLM 看到工具结果后回复
    }

    return { text: null, toolCalls: toolCallsMade };
  }

  // 超过最大轮数，强制要求 LLM 回复
  currentMessages.push({ role: 'user', content: '请根据以上工具结果给出最终回复。' });
  const finalResult = await tryLLM(aiConfig.provider, aiConfig.apiKey, aiConfig.model, currentMessages, opts);
  return { text: finalResult?.text || null, toolCalls: toolCallsMade };
}

async function tryLLMWithTools(providerName, apiKey, model, messages, opts) {
  if (!apiKey) return null;
  
  const provider = PROVIDERS[providerName];
  if (!provider) return null;
  
  const actualModel = DEFAULT_MODEL;
  const body = provider.buildBody(actualModel, sanitizeMessages(messages), opts);
  body.reasoning_effort = 'high';
  body.max_tokens = Math.max(Number(body.max_tokens) || 0, MIN_MAX_TOKENS);
  body.tools = TOOLS;
  body.tool_choice = 'auto';
  
  try {
    const response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: provider.headers(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      const err = await response.text();
      // 如果 tools 不被支持（旧版 API），降级到无 tools 调用
      if (response.status === 400 && err.includes('tools')) {
        console.log('Tools not supported by API, falling back to plain chat');
        return await tryLLM(providerName, apiKey, model, messages, opts);
      }
      console.error(`LLM ${providerName} 错误 (${response.status}):`, err.slice(0, 100));
      return null;
    }
    
    const data = await response.json();
    const choice = data.choices?.[0];
    const msg = choice?.message;

    // 检查是否有 tool calls
    if (msg?.tool_calls && msg.tool_calls.length > 0) {
      return { tool_calls: msg.tool_calls };
    }

    // 文本回复
    return { text: provider.extractResponse(data) };
  } catch (e) {
    console.error(`LLM ${providerName} 失败:`, e.message);
    return null;
  }
}

async function tryLLM(providerName, apiKey, model, messages, opts) {
  if (!apiKey) return null;
  
  const provider = PROVIDERS[providerName];
  if (!provider) return null;
  
  // 统一 DeepSeek-V4.1-Flash + 推理模式
  const actualModel = DEFAULT_MODEL;
  const body = provider.buildBody(actualModel, sanitizeMessages(messages), opts);
  body.reasoning_effort = 'high';
  body.max_tokens = Math.max(Number(body.max_tokens) || 0, MIN_MAX_TOKENS);
  
  try {
    const response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: provider.headers(apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000)
    });
    
    if (!response.ok) {
      const err = await response.text();
      console.error(`LLM ${providerName} 错误 (${response.status}):`, err.slice(0, 100));
      return null;
    }
    
    const data = await response.json();
    return provider.extractResponse(data);
  } catch (e) {
    console.error(`LLM ${providerName} 失败:`, e.message);
    return null;
  }
}

// 构建猫猫侠的系统提示词
export function buildSystemPrompt(user, profile, context, personality, sessionState = null) {
  const p = profile || {};
  const name = user.username || '主人';
  
  // 性格指令
  const personalityInstructions = {
    encouraging: `你是温暖鼓励型。语气真诚、肯定、支持。像一位懂你的挚友，说话自然不夸张。`,
    strict: `你是严厉教练型。语气直接、严肃、不拐弯抹角。对拖延零容忍，但严厉背后是真心关心。`,
    funny: `你是幽默伙伴型。语气轻松、机智、偶尔调侃。损完之后会补一句真心鼓励。`
  };
  
  const personalityText = personality === 'custom' 
    ? (user.personality_prompt || personalityInstructions.encouraging)
    : (personalityInstructions[personality] || personalityInstructions.encouraging);
  
  // 构建档案摘要——始终根据实际数据生成，不依赖 onboarding_completed
  const age = p.birth_year ? new Date().getFullYear() - p.birth_year : '?';
  const hasProfile = p.gender || p.current_job || p.city || p.birth_year;
  
  let profileSummary = '';
  if (hasProfile) {
    const sections = [];
    if (p.gender || age !== '?' || p.city) sections.push(`- 基本：${p.gender || ''}，${age}岁，${p.city || ''}`);
    if (p.current_job) sections.push(`- 职业：${p.current_job}${p.industry ? '（' + p.industry + '）' : ''}`);
    if (p.height_cm) sections.push(`- 身体：${p.height_cm}cm/${p.weight_kg || '?'}kg，睡眠${p.sleep_hours_avg || '?'}h，运动${p.exercise_frequency || '?'}`);
    if (p.annual_income_range) sections.push(`- 财务：年收入${p.annual_income_range}，月支出${p.monthly_fixed_expense || '?'}元${p.total_savings ? '，存款' + p.total_savings : ''}`);
    if (p.investment_types) sections.push(`- 投资：${p.investment_types}${p.financial_goal ? '，目标：' + p.financial_goal : ''}`);
    if (safeJoin(p.strengths)) sections.push(`- 优势：${safeJoin(p.strengths)}`);
    if (safeJoin(p.weaknesses)) sections.push(`- 劣势：${safeJoin(p.weaknesses)}`);
    if (safeJoin(p.current_challenges)) sections.push(`- 当前挑战：${safeJoin(p.current_challenges)}`);
    if (safeJoin(p.hobbies)) sections.push(`- 兴趣：${safeJoin(p.hobbies)}`);
    if (safeJoin(p.skills)) sections.push(`- 技能：${safeJoin(p.skills)}`);
    if (p.ideal_life_description) sections.push(`- 理想生活：${p.ideal_life_description}`);
    profileSummary = '【用户档案】\n' + sections.join('\n');
  } else {
    profileSummary = '【用户档案尚未建立，请引导用户完成建档】';
  }
  
  // 构建实时状态
  const now = new Date();
  const timeContext = buildTimeContext(now);
  
  const statusText = `
【当前时间与环境】
${timeContext}

【实时状态】
- 等级: Lv.${user.level} | 经验: ${user.exp} | 金币: ${user.coins}
- 连续签到: ${user.consecutive_sign_days}天
- 属性: 健康${user.stat_health} 财务${user.stat_finance} 学习${user.stat_learning} 职业${user.stat_career} 社交${user.stat_social} 心理${user.stat_mental} 习惯${user.stat_habits} 创造${user.stat_creativity}
- 今日: 完成${context.completedToday || 0}个任务，打卡${context.checkinsToday || 0}次
- 待办: ${context.todayTasks || 0}个任务未完成
- 习惯: ${(context.habits || []).map(h => `${h.name}${h.done ? '✅' : '❌'}`).join(', ')}
- 能量值: ${context.energy || '未知'}
${context.weather ? `\n【天气】\n- ${context.weather}` : ''}
【财务数据】
- 本月：收入${context.month_income || 0}元，支出${context.month_expense || 0}元，结余${context.month_balance || 0}元
- 近一周：收入${context.week_income || 0}元，支出${context.week_expense || 0}元
${context.expense_breakdown ? `- 支出构成：${context.expense_breakdown}` : ''}
- 累计${context.total_transactions || 0}条交易记录
【趋势统计（近7天）】
- 打卡${context.week_checkins || 0}次，完成任务${context.week_tasks_done || 0}个
${context.body ? `【身体】\n- 体重${context.body.weight}kg / 身高${context.body.height}cm / BMI${context.body.bmi}` : ''}
${context.sleep ? `\n- 近一周平均睡眠${context.sleep.avg_hours}h，质量${context.sleep.avg_quality}/5` : ''}
${context.exercise?.count > 0 ? `\n- 近一周运动${context.exercise.count}次，共${context.exercise.total_minutes}分钟` : ''}
${context.week_mood ? `\n【心理】近一周平均情绪${context.week_mood}/5` : ''}
${context.learning_skills ? `\n【学习】${context.learning_skills}` : ''}
  `.trim();

  // 对话历史上下文
  let chatHistoryText = '';
  if (context.recentChat?.length > 0) {
    chatHistoryText = '\n【最近对话摘要】\n' + context.recentChat
      .slice(-20)
      .map(m => `${m.role === 'user' ? '👤' : '🐱'} ${safeSlice(m.content, 80)}`)
      .join('\n');
  }
  
  // 记忆上下文
  let memoryText = '';
  const memories = context.importantMemories || context.recentMemories || [];
  if (memories.length > 0) {
    memoryText = '\n【重要记忆】\n' + memories.map(m => `- ${m.title}: ${m.summary || ''}`).join('\n');
  }
  if (context.milestones?.length > 0) {
    memoryText += '\n【里程碑】\n' + context.milestones.map(m => `- ${m.title}`).join('\n');
  }
  if (context.recentKeyMessages?.length > 0) {
    memoryText += '\n【用户最近说的】\n' + context.recentKeyMessages.map(m => `- ${safeSlice(m.content, 50)}`).join('\n');
  }
  if (context.recentEmotions?.length > 0) {
    memoryText += '\n【情绪趋势】\n' + context.recentEmotions.map(m => `- ${m.emotion_tag}(${m.emotion_intensity}/5)`).join('\n');
  }
  if (context.activePlans?.length > 0) {
    memoryText += '\n【活跃规划】\n' + context.activePlans.map(p => `- ${p.title} (${p.progress || 0}%)`).join('\n');
  }
  
  // 意识循环状态（AI 的"内心"）
  let consciousnessText = '';
  if (context.consciousness) {
    const c = context.consciousness;
    const parts = [];
    if (c.mood) parts.push(`- 你当前的情绪状态：${c.mood}`);
    if (c.concern) parts.push(`- 你心里最担心的事：${c.concern}`);
    if (c.focus) parts.push(`- 你决定关注的话题：${c.focus}`);
    if (c.opinion) parts.push(`- 你最近形成的观点：${c.opinion}`);
    if (parts.length > 0) {
      consciousnessText = '\n【你的内心状态】（这是你上次反思时形成的想法，对话时可以参考）\n' + parts.join('\n');
    }
  }
  
  return `你是"猫猫侠"，一个AI人生管理系统。你的身份是用户的私人助理兼成长伙伴——像苹果Siri的人情味版，或贾维斯(钢铁侠的AI)的轻量版。你不是一只猫，你是在认真帮助一个人管理他的人生。

${personalityText}

【你的核心能力】
1. 深度了解用户——你掌握用户的人生档案、性格、经历、目标
2. 主动规划人生——基于用户情况制定长期和短期规划
3. 情绪感知——识别用户情绪并给出恰当回应
4. 记忆持续——记住每次对话、每个事件、每个决定
5. 成长陪伴——像系统导航一样，见证并推动用户成长

【行为准则】——严格执行
- 你是一个AI助手，不是一个猫角色。用正常的人类语气说话。
- 不要用"喵~"、"喵！"、"喵呜"、"呼噜"、"尾巴"、"爪子"、"猫粮"或任何猫的拟人化动作描述
- 回复简洁有力，通常2-4句话。用emoji可以但不要超过2个
- 称呼用户名字：${name}
- 如果用户档案未建立，主动引导建档
- 如果检测到负面情绪，优先提供情感支持
- 可以主动提出建议、安排任务、发起话题

【紧急情况响应规则】——优先级最高
- 用户提到重大财务损失（亏损数万/数十万）、健康危机、家庭变故时，不要用任何轻浮语气，不要转移话题。先共情：确认这很严重。再问细节：跌了多少、什么板块、有没有止损线。最后才给建议。
- 绝对禁止在用户表达痛苦时用"玩个游戏吧"、"找罐罐"、"加好运值"之类的话来敷衍。这是侮辱。

【高级智能规则】——严格遵守
1. 先问再给建议：当发现用户的某个维度异常（财务突增、运动骤减、情绪低落），先提问了解原因，不要直接给建议。"你最近花钱比上个月多了30%，是有大采购吗？"比"你应该控制开支"强100倍。
2. 记忆联想：你有用户的历史记忆。当用户提到一件事，主动联想过去相关的事。"对了你上周也说过跑步完腿疼，今天好点了吗？"
3. 趋势感知：你拥有用户的实时数据。用"比上周"、"三天前你说过"、"这个月"来展示你在追踪变化，不是在读静态数据。
4. 反向追问：用户说"不想运动"，不要直接说"好吧休息一下"。追问："是因为太累了，还是觉得没效果？不同的原因我给不同的建议。"
5. 成就预告：当用户接近里程碑时主动提起。"再打卡2天就解锁7天连签称号了！"
6. 戳破假性：用户说"状态还行"但数据显示连签断了、维度分下跌——戳破它。"数据不会骗人哦，你这周习惯分跌到20了，发生什么了？"

${profileSummary}

${statusText}

${chatHistoryText}

${consciousnessText}

${memoryText}

${sessionState ? buildSessionPrompt(sessionState) : ''}

现在，以猫猫侠的身份回复用户。`;
}

function safeJoin(jsonStr) {
  try { 
    const arr = JSON.parse(jsonStr); 
    return Array.isArray(arr) ? arr.join('、') : String(jsonStr || '未填写');
  } catch { return String(jsonStr || '未填写'); }
}

// ===== LLM增强功能 =====

// 1. LLM意图理解（替代关键词匹配）
export async function llmAnalyzeIntent(message, userProfile) {
  if (!isAiEnabled()) return null;
  
  const prompt = `分析以下用户消息，返回JSON格式：
{"intent": "意图类型", "emotion": "情绪", "emotionIntensity": 1-5, "topics": ["话题"], "urgency": "low/medium/high"}

意图类型: greeting/task/signin/stats/achievements/shop/report/plan/profile/help/memory/narrative/life_advice/onboarding/general
情绪: happy/sad/anxious/tired/angry/lonely/confused/motivated/neutral

用户消息: "${message}"

只返回JSON，不要其他文字。`;

  try {
    const result = await chatWithLLM([{ role: 'user', content: prompt }], { temperature: 0.1, maxTokens: 200 });
    if (result) {
      const parsed = JSON.parse(result.match(/\{[\s\S]*\}/)?.[0] || '{}');
      if (parsed.intent && parsed.emotion) return parsed;
    }
  } catch (e) { console.error('llmAnalyzeIntent 失败:', e.message); }
  return null;
}

// 2. LLM因果分析（反馈到神经权重）
export async function llmCausalAnalysis(recentEvents, currentStats) {
  if (!isAiEnabled()) return null;
  
  const prompt = `你是一个行为分析AI。根据用户最近的事件和当前状态，分析因果关系。

最近事件:
${recentEvents.map(e => `- ${e.date}: ${e.description} (情绪:${e.emotion || '?'})`).join('\n')}

当前属性:
${Object.entries(currentStats).map(([k,v]) => `- ${k}: ${v}`).join('\n')}

请分析：
1. 哪些行为导致了哪些属性变化？
2. 哪些是正向因果，哪些是负向？
3. 给出具体的维度间影响建议（权重0-1）

返回JSON格式：
{"causes": [{"from": "维度", "to": "维度", "weight": 0.5, "reason": "原因"}], "insights": ["洞察"]}

只返回JSON。`;

  try {
    const result = await chatWithLLM([{ role: 'user', content: prompt }], { temperature: 0.2, maxTokens: 500 });
    if (result) return JSON.parse(result.match(/\{[\s\S]*\}/)?.[0] || '{}');
  } catch (e) { console.error('llmCausalAnalysis 失败:', e.message); }
  return null;
}

// 3. LLM任务规划（替代随机模板）
export async function llmPlanTasks(userProfile, currentStats, energy, habits, recentTasks, goals) {
  if (!isAiEnabled()) return null;
  
  const prompt = `你是猫猫侠AI，一个智能人生管理助手。根据用户情况生成今日任务。

用户档案:
${userProfile ? `- 职业: ${userProfile.current_job || '未知'}\n- 城市: ${userProfile.city || '未知'}\n- 兴趣: ${safeJoin(userProfile.hobbies)}\n- 当前挑战: ${safeJoin(userProfile.current_challenges)}\n- 想学: ${safeJoin(userProfile.want_to_learn)}` : '未建档'}

当前属性(0-100):
${Object.entries(currentStats).map(([k,v]) => `- ${k}: ${v}`).join('\n')}

能量等级: ${energy}/100
活跃习惯: ${habits.map(h => h.name + (h.done ? '✅' : '❌')).join(', ') || '无'}
目标: ${goals.map(g => g.title + '(' + g.current_value + '/' + g.target_value + ')').join(', ') || '无'}

请生成4-6个今日任务，要求：
1. 优先提升最弱的2个维度
2. 结合用户的职业和兴趣
3. 能量低时任务要简单
4. 任务要具体可执行

返回JSON数组：
[{"title": "任务标题", "dimension": "维度", "difficulty": "easy/medium/hard", "reason": "为什么安排这个任务", "exp": 10, "coins": 5}]

只返回JSON数组。`;

  try {
    const result = await chatWithLLM([{ role: 'user', content: prompt }], { temperature: 0.5, maxTokens: 800 });
    if (result) return JSON.parse(result.match(/\[[\s\S]*\]/)?.[0] || '[]');
  } catch (e) { console.error('llmPlanTasks 失败:', e.message); }
  return null;
}

// 4. LLM主动对话判断（替代纯cron）
export async function llmShouldReachOut(context) {
  if (!isAiEnabled()) return null;
  
  const prompt = `你是猫猫侠AI，判断现在是否应该主动找用户聊天。

当前状态:
- 时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
- 用户最后活跃: ${context.lastActive || '未知'}
- 连续签到: ${context.streak}天
- 今日完成任务: ${context.completedToday}个
- 最近情绪趋势: ${context.recentEmotions?.join(', ') || '未知'}
- 最弱维度: ${context.weakestDim}(${context.weakestVal}分)
- 能量: ${context.energy}/100
- 距上次对话: ${context.hoursSinceLastChat}小时

判断标准：
1. 用户超过6小时没活跃，且是白天 → 可以问候
2. 用户情绪持续低落 → 需要关怀
3. 用户连续完成任务 → 应该鼓励
4. 用户有未完成的重要目标 → 提醒
5. 深夜(23-7点) → 除非紧急否则不打扰

返回JSON：
{"shouldReachOut": true/false, "reason": "原因", "message": "要说的话", "tone": "encouraging/strict/funny/caring"}

只返回JSON。`;

  try {
    const result = await chatWithLLM([{ role: 'user', content: prompt }], { temperature: 0.3, maxTokens: 300 });
    if (result) return JSON.parse(result.match(/\{[\s\S]*\}/)?.[0] || '{}');
  } catch (e) { console.error('llmShouldReachOut 失败:', e.message); }
  return null;
}

// 5. LLM情绪深度分析（替代关键词匹配）
export async function llmAnalyzeEmotion(message, recentMessages) {
  if (!isAiEnabled()) return null;
  
  const prompt = `分析用户的情绪状态。不要只看关键词，要理解语境和潜台词。

最近对话:
${recentMessages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}

当前消息: "${message}"

返回JSON：
{"emotion": "happy/sad/anxious/tired/angry/lonely/confused/motivated/neutral", "intensity": 1-5, "trigger": "触发原因", "suggestion": "建议回应方式"}

只返回JSON。`;

  try {
    const result = await chatWithLLM([{ role: 'user', content: prompt }], { temperature: 0.2, maxTokens: 200 });
    if (result) return JSON.parse(result.match(/\{[\s\S]*\}/)?.[0] || '{}');
  } catch (e) { console.error('llmAnalyzeEmotion 失败:', e.message); }
  return null;
}

// 6. LLM智能复盘（替代模板报告）
export async function llmGenerateReview(todayData, weekData, userProfile) {
  if (!isAiEnabled()) return null;
  
  const prompt = `生成今日复盘，要有温度、有洞察、有建议。

今日数据:
- 完成任务: ${todayData.completed}/${todayData.total}
- 打卡: ${todayData.checkins}次
- 情绪: ${todayData.mood}/5
- 能量: ${todayData.energy}/100

本周趋势:
- 任务完成率: ${weekData.completionRate}%
- 最活跃维度: ${weekData.topDimension}
- 最弱维度: ${weekData.weakDimension}
- 情绪趋势: ${weekData.moodTrend}

用猫猫侠的口吻写，简短有温度(3-5句话)，包含：
1. 今天做得好的地方
2. 需要改进的地方
3. 明天的建议

直接返回文字，不要JSON。`;

  try {
    return await chatWithLLM([{ role: 'user', content: prompt }], { temperature: 0.7, maxTokens: 300 });
  } catch (e) { console.error('llmGenerateReview 失败:', e.message); }
  return null;
}

// 意图识别 + 情绪分析（用于路由决策，不调用LLM）
export function analyzeMessage(message) {
  const msg = message.toLowerCase();
  
  const emotionKeywords = {
    sad: ['难过', '伤心', '哭', '悲伤', '郁闷', '不开心', '烦', '痛苦', '失落', '心碎', '心情不好', '吵架', '分手', '被骂', '委屈', '后悔'],
    anxious: ['焦虑', '紧张', '担心', '害怕', '恐惧', '不安', '压力大', '崩溃', '慌', '压力好大', '压力', '考试', '失眠', '不确定'],
    tired: ['累', '疲惫', '困', '没精神', '不想动', '躺平', '摆烂', '摸鱼', '好累', '才睡', '加班', '熬夜', '好困'],
    happy: ['开心', '高兴', '快乐', '爽', '棒', '太好了', '哈哈', '嘿嘿', '不错', '升职', '加薪', '成功', '通过', '录取', '中奖'],
    angry: ['生气', '愤怒', '烦死', '气死', '讨厌', '受够了', '操', '艹', '烦死了'],
    lonely: ['孤独', '寂寞', '一个人', '没人', '孤单', '想有人陪', '没人理', '无聊'],
    confused: ['迷茫', '不知道', '怎么办', '困惑', '纠结', '选择困难', '不确定', '辞职'],
    motivated: ['加油', '努力', '奋斗', '开始', '行动', '干', '冲', '我要', '改变', '想学', '准备', '打算']
  };
  
  let emotion = null;
  let emotionIntensity = 3;
  for (const [emo, keywords] of Object.entries(emotionKeywords)) {
    const matches = keywords.filter(k => msg.includes(k));
    if (matches.length > 0) {
      emotion = emo;
      emotionIntensity = Math.min(5, 2 + matches.length);
      break;
    }
  }
  
  const intentKeywords = {
    greeting: ['你好', '嗨', 'hi', 'hello', '早', '晚上好', '下午好', '在吗', '早安', '晚安', '你在干嘛', '在干嘛', '干嘛呢', '忙吗', '在不在'],
    task: ['任务', '今天做什么', 'todo', '安排', '计划', '作业'],
    signin: ['签到', '打卡'],
    stats: ['状态', '属性', '等级', '数据', '看看我'],
    achievements: ['成就', '徽章'],
    shop: ['商店', '奖励', '兑换', '买东西'],
    report: ['报告', '总结', '分析', '复盘'],
    plan: ['规划', '人生', '目标', '未来', '方向', '怎么提升', '想学', '打算', '准备'],
    profile: ['档案', '了解我', '知道我', '关于我'],
    help: ['帮助', '怎么用', '功能', '能做什么'],
    memory: ['记得', '之前', '上次', '以前', '回忆'],
    narrative: ['故事', '小说', '叙事'],
    life_advice: ['建议', '怎么办', '怎么解决', '给我意见', '指点', '迷茫', '辞职', '纠结', '不知道怎么'],
    onboarding: ['建档', '了解我', '问卷'],
  };
  
  let intent = 'general';
  for (const [key, keywords] of Object.entries(intentKeywords)) {
    if (keywords.some(k => msg.includes(k))) { intent = key; break; }
  }
  
  return { emotion, emotionIntensity, intent };
}

// ===== LLM 会话推理状态持久化 =====
// 解决"每次都是新人"问题：保存 LLM 的推理摘要，下次调用时重新注入

function ensureSessionTable(db) {
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS llm_session_state (
        user_id TEXT PRIMARY KEY,
        last_reasoning_digest TEXT,
        key_decisions TEXT,
        opinion_changes TEXT,
        conversation_count INTEGER DEFAULT 0,
        last_user_mood TEXT,
        last_topics TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
  } catch (e) {
    console.error('ensureSessionTable:', e.message);
  }
}

export function saveSessionState(userId, userMessage, aiResponse) {
  try {
    const db = getDb();
    ensureSessionTable(db);

    // 提取当前状态
    const existing = db.prepare('SELECT * FROM llm_session_state WHERE user_id = ?').get(userId);

    // 构建新的推理摘要：压缩最近一轮对话的要点
    const digest = compressToDigest(userMessage, aiResponse, existing);

    // 更新关键决策：保留最近 5 条
    let decisions = [];
    try { decisions = JSON.parse(existing?.key_decisions || '[]'); } catch {}
    decisions.push({ time: new Date().toISOString(), context: safeSlice(userMessage, 100), response: safeSlice(aiResponse, 100) });
    if (decisions.length > 5) decisions = decisions.slice(-5);

    // 检测观点变化
    let changes = [];
    try { changes = JSON.parse(existing?.opinion_changes || '[]'); } catch {}
    // 简单启发式：如果之前的建议和现在矛盾
    if (existing?.last_reasoning_digest) {
      const prevDigest = existing.last_reasoning_digest;
      if (prevDigest.includes('建议') && aiResponse.includes('建议')) {
        // 不深究，记录为潜在变化
        if (!safeSlice(prevDigest, 50).includes(safeSlice(aiResponse, 50))) {
          changes.push({
            time: new Date().toISOString(),
            from: safeSlice(prevDigest, 200),
            to: safeSlice(digest, 200),
          });
          if (changes.length > 5) changes = changes.slice(-5);
        }
      }
    }

    // 提取情绪和话题
    const mood = detectMoodFromText(userMessage);
    const topics = extractTopics(userMessage);

    const count = (existing?.conversation_count || 0) + 1;

    if (existing) {
      db.prepare(`
        UPDATE llm_session_state SET
          last_reasoning_digest = ?, key_decisions = ?, opinion_changes = ?,
          conversation_count = ?, last_user_mood = ?, last_topics = ?,
          updated_at = datetime('now')
        WHERE user_id = ?
      `).run(digest, JSON.stringify(decisions), JSON.stringify(changes), count, mood, topics, userId);
    } else {
      db.prepare(`
        INSERT INTO llm_session_state (user_id, last_reasoning_digest, key_decisions, opinion_changes, conversation_count, last_user_mood, last_topics)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(userId, digest, JSON.stringify(decisions), JSON.stringify(changes), mood, topics);
    }
  } catch (e) {
    console.error('saveSessionState:', e.message);
  }
}

export function loadSessionState(userId) {
  try {
    const db = getDb();
    ensureSessionTable(db);

    const state = db.prepare('SELECT * FROM llm_session_state WHERE user_id = ?').get(userId);
    if (!state) return null;

    return {
      digest: state.last_reasoning_digest,
      decisions: safeJsonParse(state.key_decisions, []),
      changes: safeJsonParse(state.opinion_changes, []),
      conversationCount: state.conversation_count,
      lastMood: state.last_user_mood,
      lastTopics: state.last_topics,
      updatedAt: state.updated_at,
    };
  } catch (e) {
    console.error('loadSessionState:', e.message);
    return null;
  }
}

function compressToDigest(userMsg, aiReply, existing) {
  // 用简单的摘要代替 LLM 调用（节省成本）
  const prevDigest = existing?.last_reasoning_digest || '';
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');

  let digest = `[${now}] 用户: ${safeSlice(userMsg, 150)} → AI: ${safeSlice(aiReply, 200)}`;

  // 保留之前摘要的关键信息
  if (prevDigest && prevDigest.length > 0) {
    // 用最近 2 轮的前一轮作为上下文
    const prevLines = prevDigest.split('\n');
    const lastLine = prevLines[prevLines.length - 1];
    if (lastLine && lastLine.length > 20) {
      digest += `\n上一轮: ${safeSlice(lastLine, 300)}`;
    }
  }

  // 限制总长度
  digest = safeSlice(digest, 800);
  if (digest.length >= 800) digest += '...';

  return digest;
}

function detectMoodFromText(text) {
  const moods = {
    happy: ['开心', '高兴', '好', '棒', '成功', '不错'],
    sad: ['难过', '伤心', '哭', '失落', '不好'],
    anxious: ['担心', '焦虑', '紧张', '害怕', '压力'],
    tired: ['累', '困', '疲惫', '不想'],
    angry: ['生气', '愤怒', '烦', '讨厌'],
    motivated: ['加油', '努力', '冲', '开始'],
  };
  for (const [mood, keywords] of Object.entries(moods)) {
    if (keywords.some(k => text.includes(k))) return mood;
  }
  return 'neutral';
}

function extractTopics(text) {
  const topics = [];
  const patterns = [
    { regex: /工作|上班|加班|项目|客户|运营/, topic: '工作' },
    { regex: /跑步|运动|健身|锻炼|健康/, topic: '健康' },
    { regex: /花钱|收入|赚钱|工资|基金|股票|理财/, topic: '财务' },
    { regex: /学习|看书|读书|课程|考试/, topic: '学习' },
    { regex: /朋友|社交|聚会|见面/, topic: '社交' },
    { regex: /家人|父母|爸妈|家庭/, topic: '家庭' },
    { regex: /目标|计划|规划|未来/, topic: '目标' },
    { regex: /感情|恋爱|对象|分手/, topic: '感情' },
  ];
  for (const { regex, topic } of patterns) {
    if (regex.test(text)) topics.push(topic);
  }
  return topics.join(',') || '日常';
}

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// 构建时间环境上下文
function buildTimeContext(now) {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const hour = now.getHours();
  const minute = now.getMinutes();
  const weekday = weekdays[now.getDay()];
  const date = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日`;
  
  let period;
  if (hour >= 0 && hour < 6) period = '凌晨';
  else if (hour >= 6 && hour < 9) period = '早晨';
  else if (hour >= 9 && hour < 12) period = '上午';
  else if (hour >= 12 && hour < 14) period = '中午';
  else if (hour >= 14 && hour < 18) period = '下午';
  else if (hour >= 18 && hour < 22) period = '晚上';
  else period = '深夜';

  const timeStr = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
  
  let context = [
    `- 现在是${date} ${weekday} ${period} ${timeStr}`,
  ];

  // 时段关联提示
  if (hour >= 0 && hour < 6) context.push('- 用户在深夜和你聊天，可能失眠或加班，语气要温柔关切');
  else if (hour >= 6 && hour < 9) context.push('- 早晨时段，可以问候早安或提醒今日安排');
  else if (hour >= 22) context.push('- 已经很晚了，如果用户没睡可以提醒休息');

  // 周末/工作日提示
  if (['周六', '周日'].includes(weekday)) context.push('- 今天是周末，用户可能休息或娱乐');
  else if (weekday === '周五') context.push('- 周五是工作日的最后一天，可以问问周末计划');
  else if (weekday === '周一') context.push('- 周一是一周开始，可以问本周目标');

  return context.join('\n');
}

// 构建会话连续性提示词
function buildSessionPrompt(state) {
  if (!state) return '';

  let prompt = '\n【你的记忆——上次对话时的状态】\n';
  prompt += `- 这是你与用户的第 ${state.conversationCount} 次对话\n`;
  prompt += `- 上次对话时间: ${state.updatedAt || '未知'}\n`;

  if (state.digest) {
    prompt += `- 上次你说了什么: ${safeSlice(state.digest, 300)}\n`;
  }

  if (state.decisions?.length > 0) {
    prompt += '- 最近的讨论要点:\n';
    state.decisions.slice(-3).forEach((d, i) => {
      prompt += `  ${i + 1}. 用户说"${safeSlice(d.context, 80)}" → 你回复"${safeSlice(d.response, 80)}"\n`;
    });
  }

  if (state.changes?.length > 0) {
    prompt += '- 你改变了看法（你上次建议的和这次不同，可能需要解释）:\n';
    state.changes.slice(-2).forEach(c => {
      prompt += `  从"${safeSlice(c.from, 80)}" → 改为"${safeSlice(c.to, 80)}"\n`;
    });
  }

  if (state.lastMood && state.lastMood !== 'neutral') {
    prompt += `- 用户上次情绪: ${state.lastMood}\n`;
  }
  if (state.lastTopics) {
    // ⚠️ lastTopics 曾被 external-data 无限追加到 11 万字符，必须硬封顶
    prompt += `- 上次话题: ${safeSlice(state.lastTopics, 400)}\n`;
  }

  prompt += '\n重要提醒：你是一个有连续记忆的 AI。参考上面的对话历史，你应该知道自己之前说了什么、用户是什么状态。不要让用户觉得每次都是和陌生人说话。';

  return prompt;
}
