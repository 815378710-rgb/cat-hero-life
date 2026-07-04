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
  } catch {}
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
  } catch {}
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
  } catch {}
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
  } catch {}
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
  } catch {}
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
  } catch {}
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
