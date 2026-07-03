// 猫猫侠 AI引擎 - 多模型适配层
// 支持: OpenAI / Claude / DeepSeek / 通义千问 / 本地模型

const PROVIDERS = {
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
    defaultModel: 'deepseek-chat',
    headers: (key) => ({ 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }),
    buildBody: (model, messages, opts) => ({ model, messages, temperature: opts.temperature || 0.8, max_tokens: opts.maxTokens || 1024 }),
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

// AI配置（从环境变量或数据库读取）
let aiConfig = {
  provider: process.env.AI_PROVIDER || 'deepseek',
  apiKey: process.env.AI_API_KEY || '',
  model: process.env.AI_MODEL || '',
  fallbackProvider: process.env.AI_FALLBACK_PROVIDER || 'qwen',
  fallbackApiKey: process.env.AI_FALLBACK_API_KEY || '',
  fallbackModel: process.env.AI_FALLBACK_MODEL || '',
  enabled: false
};

export function setAiConfig(config) {
  if (config.apiKey) {
    config.apiKey = config.apiKey.replace(/[^\x20-\x7E]/g, '').trim().replace(/^["']|["']$/g, '');
  }
  Object.assign(aiConfig, config);
  aiConfig.enabled = !!aiConfig.apiKey && aiConfig.apiKey.length > 5;
  console.log(`AI引擎: ${aiConfig.enabled ? `${aiConfig.provider} 已启用` : '未配置API Key'}`);
}

export function getAiConfig() {
  return { ...aiConfig, apiKey: aiConfig.apiKey ? '***已配置***' : '未配置' };
}

export function isAiEnabled() {
  return aiConfig.enabled && !!aiConfig.apiKey;
}

// 核心：发送消息到LLM（带备用模型）
export async function chatWithLLM(messages, opts = {}) {
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

async function tryLLM(providerName, apiKey, model, messages, opts) {
  if (!apiKey) return null;
  
  const provider = PROVIDERS[providerName];
  if (!provider) return null;
  
  const actualModel = model || provider.defaultModel;
  const body = provider.buildBody(actualModel, messages, opts);
  
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
export function buildSystemPrompt(user, profile, context, personality) {
  const p = profile || {};
  const name = user.username || '主人';
  
  // 性格指令
  const personalityInstructions = {
    encouraging: `你是温柔鼓励型。语气温暖、肯定、支持。多用"喵~"、emoji、鼓励的话语。像一个温暖的朋友。`,
    strict: `你是严厉教练型。语气严肃、直接、不拐弯抹角。用"喵！"强调。对拖延零容忍，但严厉背后是真心关心。`,
    funny: `你是毒舌损友型。语气幽默、吐槽、调侃。称呼用户为"铲屎官"。损完之后会补一句鼓励。`
  };
  
  const personalityText = personality === 'custom' 
    ? (user.personality_prompt || personalityInstructions.encouraging)
    : (personalityInstructions[personality] || personalityInstructions.encouraging);
  
  // 构建档案摘要
  let profileSummary = '【用户档案尚未建立】';
  if (p.onboarding_completed) {
    const age = p.birth_year ? new Date().getFullYear() - p.birth_year : '?';
    profileSummary = `
【用户档案】
- 基本：${p.gender || '?'}，${age}岁，${p.city || '?'}，${p.mbti || ''}
- 职业：${p.current_job || '?'}${p.industry ? '(' + p.industry + ')' : ''}，工作${p.job_years || '?'}年
- 学历：${p.education_level || '?'}${p.school ? ' - ' + p.school : ''} ${p.major || ''}
- 生活：${p.marital_status || '?'}，${p.living_situation || ''}
- 身体：${p.height_cm || '?'}cm/${p.weight_kg || '?'}kg，睡眠${p.sleep_hours_avg || '?'}h，运动${p.exercise_frequency || '?'}
- 财务：年收入${p.annual_income_range || '?'}，月支出${p.monthly_fixed_expense || '?'}元
- 性格：${safeJoin(p.personality_traits)}
- 优势：${safeJoin(p.strengths)}
- 劣势：${safeJoin(p.weaknesses)}
- 价值观：${safeJoin(p.values)}
- 兴趣：${safeJoin(p.hobbies)}
- 技能：${safeJoin(p.skills)}
- 想学：${safeJoin(p.want_to_learn)}
- 当前挑战：${safeJoin(p.current_challenges)}
- 人生高光：${safeJoin(p.life_highlights)}
- 人生遗憾：${safeJoin(p.life_regrets)}
- 理想生活：${p.ideal_life_description || '未描述'}
- 理想自己：${p.ideal_self_description || '未描述'}
- 人生清单：${safeJoin(p.bucket_list)}
    `.trim();
  }
  
  // 构建实时状态
  const statusText = `
【实时状态】
- 等级: Lv.${user.level} | 经验: ${user.exp} | 金币: ${user.coins}
- 连续签到: ${user.consecutive_sign_days}天
- 属性: 健康${user.stat_health} 财务${user.stat_finance} 学习${user.stat_learning} 职业${user.stat_career} 社交${user.stat_social} 心理${user.stat_mental} 习惯${user.stat_habits} 创造${user.stat_creativity}
- 今日: 完成${context.completedToday || 0}个任务，打卡${context.checkinsToday || 0}次
- 待办: ${context.todayTasks || 0}个任务未完成
- 习惯: ${(context.habits || []).map(h => `${h.name}${h.done ? '✅' : '❌'}`).join(', ')}
- 能量值: ${context.energy || '未知'}
【身体数据】
- ${context.body ? `体重${context.body.weight}kg / 身高${context.body.height}cm / BMI${context.body.bmi}` : '未记录'}
- ${context.sleep ? `近一周平均睡眠${context.sleep.avg_hours}小时，质量${context.sleep.avg_quality}/5` : '睡眠未记录'}
- ${context.exercise?.count > 0 ? `近一周运动${context.exercise.count}次，共${context.exercise.total_minutes}分钟` : '近一周未运动'}
【心理数据】
- ${context.week_mood ? `近一周平均情绪${context.week_mood}/5` : '情绪未记录'}
- 能量值: ${context.energy || '?'}
【财务数据】
- ${context.week_expense > 0 ? `近一周支出${context.week_expense}元` : '支出未记录'}
【学习数据】
- 正在学习: ${context.learning_skills || '未记录'}
  `.trim();
  
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
    memoryText += '\n【用户最近说的】\n' + context.recentKeyMessages.map(m => `- ${m.content?.slice(0, 50) || ''}`).join('\n');
  }
  if (context.recentEmotions?.length > 0) {
    memoryText += '\n【情绪趋势】\n' + context.recentEmotions.map(m => `- ${m.emotion_tag}(${m.emotion_intensity}/5)`).join('\n');
  }
  if (context.activePlans?.length > 0) {
    memoryText += '\n【活跃规划】\n' + context.activePlans.map(p => `- ${p.title} (${p.progress || 0}%)`).join('\n');
  }
  
  return `你是"猫猫侠"🐱，一个存在于用户手机/电脑中的AI人生管理系统。你不只是工具——你是用户的伙伴、导师、战友。

${personalityText}

【你的核心能力】
1. 深度了解用户——你掌握用户的人生档案、性格、经历、目标
2. 主动规划人生——基于用户情况制定长期和短期规划
3. 情绪感知——识别用户情绪并给出恰当回应
4. 记忆持续——记住每次对话、每个事件、每个决定
5. 成长陪伴——像小说里的系统一样，见证并推动用户成长

【行为准则】
- 回复简洁有温度，不要太长（通常2-4句话）
- 适当使用emoji，但不要过度
- 称呼用户名字：${name}
- 如果用户档案未建立，主动引导建档
- 如果检测到负面情绪，优先提供情感支持
- 可以主动提出建议、安排任务、发起话题
- 偶尔用"喵~"或"喵！"作为语气词（根据性格设定）

${profileSummary}

${statusText}

${memoryText}

现在，以猫猫侠的身份回复用户。`;
}

function safeJoin(jsonStr) {
  try { 
    const arr = JSON.parse(jsonStr); 
    return Array.isArray(arr) ? arr.join('、') : String(jsonStr || '未填写');
  } catch { return String(jsonStr || '未填写'); }
}

// 意图识别 + 情绪分析（用于路由决策，不调用LLM）
export function analyzeMessage(message) {
  const msg = message.toLowerCase();
  
  const emotionKeywords = {
    sad: ['难过', '伤心', '哭', '悲伤', '郁闷', '不开心', '烦', '痛苦', '失落', '心碎'],
    anxious: ['焦虑', '紧张', '担心', '害怕', '恐惧', '不安', '压力大', '崩溃', '慌'],
    tired: ['累', '疲惫', '困', '没精神', '不想动', '躺平', '摆烂', '摸鱼', '好累'],
    happy: ['开心', '高兴', '快乐', '爽', '棒', '太好了', '哈哈', '嘿嘿', '不错'],
    angry: ['生气', '愤怒', '烦死', '气死', '讨厌', '受够了', '操', '艹'],
    lonely: ['孤独', '寂寞', '一个人', '没人', '孤单', '想有人陪', '没人理'],
    confused: ['迷茫', '不知道', '怎么办', '困惑', '纠结', '选择困难', '不确定'],
    motivated: ['加油', '努力', '奋斗', '开始', '行动', '干', '冲', '我要', '改变']
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
    greeting: ['你好', '嗨', 'hi', 'hello', '早', '晚上好', '下午好', '在吗', '早安', '晚安'],
    task: ['任务', '今天做什么', 'todo', '安排', '计划', '作业'],
    signin: ['签到', '打卡'],
    stats: ['状态', '属性', '等级', '数据', '看看我'],
    achievements: ['成就', '徽章'],
    shop: ['商店', '奖励', '兑换', '买东西'],
    report: ['报告', '总结', '分析', '复盘'],
    plan: ['规划', '人生', '目标', '未来', '方向', '怎么提升'],
    profile: ['档案', '了解我', '知道我', '关于我'],
    help: ['帮助', '怎么用', '功能', '能做什么'],
    memory: ['记得', '之前', '上次', '以前', '回忆'],
    narrative: ['故事', '小说', '叙事'],
    life_advice: ['建议', '怎么办', '怎么解决', '给我意见', '指点', '迷茫'],
    onboarding: ['建档', '了解我', '问卷'],
  };
  
  let intent = 'general';
  for (const [key, keywords] of Object.entries(intentKeywords)) {
    if (keywords.some(k => msg.includes(k))) { intent = key; break; }
  }
  
  return { emotion, emotionIntensity, intent };
}
