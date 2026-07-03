import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { chatWithLLM, isAiEnabled } from '../services/ai-engine.js';

const router = Router();

// 开始对话式建档
router.post('/start', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    
    if (profile?.onboarding_completed) {
      return res.json({ success: false, message: '档案已建立', completed: true });
    }
    
    // 初始化档案
    if (!profile) {
      db.prepare('INSERT INTO life_profile (id, user_id, onboarding_step) VALUES (?, ?, 0)').run(uuid(), user.id);
    } else {
      db.prepare('UPDATE life_profile SET onboarding_step = 0 WHERE user_id = ?').run(user.id);
    }
    
    // 猫猫侠的开场白
    const greeting = `🐱 "嘿，你好呀！我是猫猫侠，你的人生AI管家。"

🐱 "我等你很久了~ 让我好好了解你，这样才能帮你规划人生。"

🐱 "我们就像聊天一样，轻松点~ 先从简单的开始："

🐱 "你叫什么名字？多大了？在哪个城市？"`;
    
    // 存入聊天记录
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'assistant', ?)").run(user.id, greeting);
    
    // 记录建档开始
    db.prepare("INSERT INTO ai_memory (id, user_id, memory_type, title, content, summary, importance, source) VALUES (?, ?, 'milestone', '建档开始', ?, ?, 7, 'onboarding')").run(uuid(), user.id, '用户开始对话式建档', '建档流程启动');
    
    res.json({ success: true, message: greeting, step: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 处理建档对话
router.post('/chat', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    const { message } = req.body;
    
    if (!profile) return res.status(400).json({ error: '请先开始建档' });
    
    // 保存用户消息
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', ?)").run(user.id, message);
    
    const step = profile.onboarding_step || 0;
    
    // 构建建档专用prompt
    const onboardingPrompt = buildOnboardingPrompt(user, profile, step, message);
    
    let aiResponse;
    if (isAiEnabled()) {
      // 获取最近对话历史
      const history = db.prepare("SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 15").all(user.id).reverse();
      
      const messages = [
        { role: 'system', content: onboardingPrompt },
        ...history.map(m => ({ role: m.role === 'system' ? 'assistant' : m.role, content: m.content }))
      ];
      
      aiResponse = await chatWithLLM(messages, { temperature: 0.9, maxTokens: 500 });
    }
    
    if (!aiResponse) {
      aiResponse = generateFallbackOnboardingResponse(step, message);
    }
    
    // 从用户消息中提取信息并更新档案
    const extracted = extractUserInfo(message, step);
    if (Object.keys(extracted).length > 0) {
      const updates = Object.entries(extracted).map(([k]) => `${k} = ?`).join(', ');
      const values = Object.values(extracted);
      if (updates) {
        db.prepare(`UPDATE life_profile SET ${updates}, updated_at = datetime('now') WHERE user_id = ?`).run(...values, user.id);
      }
    }
    
    // 更新步骤
    const newStep = step + 1;
    db.prepare('UPDATE life_profile SET onboarding_step = ? WHERE user_id = ?').run(newStep, user.id);
    
    // 检查是否完成（10步）
    const isComplete = newStep >= 10;
    if (isComplete) {
      db.prepare('UPDATE life_profile SET onboarding_completed = 1 WHERE user_id = ?').run(user.id);
      
      // 生成初始规划
      generateInitialPlan(db, user.id);
      
      aiResponse += '\n\n🐱 "太好了！我已经全面了解你了~ 🎉"\n🐱 "基于你的情况，我为你生成了初始人生规划。去看看吧！"\n🐱 "从现在开始，我会一直陪着你，见证你的成长~ ⭐"';
    }
    
    // 保存AI回复
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'assistant', ?)").run(user.id, aiResponse);
    
    res.json({ 
      success: true, 
      response: aiResponse, 
      step: newStep, 
      completed: isComplete,
      extracted 
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取建档进度
router.get('/progress', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT onboarding_step, onboarding_completed FROM life_profile WHERE user_id = ?').get(user.id);
    res.json({ 
      step: profile?.onboarding_step || 0, 
      completed: profile?.onboarding_completed || 0,
      total: 10
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function buildOnboardingPrompt(user, profile, step, lastMessage) {
  const topicGuide = [
    '基础信息：名字、年龄、性别、城市、MBTI性格',
    '教育与职业：学历、学校、专业、当前工作、行业、工作年限',
    '生活状态：感情状态、居住情况、宠物',
    '身体状况：身高体重、睡眠、运动频率、健康问题',
    '财务概况：年收入区间、存款、负债、月支出、理财情况',
    '性格与内心：性格标签、优势、劣势、核心价值观',
    '社交关系：社交风格、好友数量、家庭关系',
    '兴趣与技能：爱好、已有技能、想学的东西、语言能力',
    '人生经历：高光时刻、遗憾、转折点、当前挑战',
    '理想人生：理想生活描述、理想自己、人生清单/遗愿清单'
  ];
  
  const currentTopic = topicGuide[step] || topicGuide[topicGuide.length - 1];
  const nextTopic = step < topicGuide.length - 1 ? topicGuide[step + 1] : null;
  
  // 已收集的信息摘要
  const collectedInfo = [];
  if (profile.gender) collectedInfo.push(`性别:${profile.gender}`);
  if (profile.birth_year) collectedInfo.push(`出生年:${profile.birth_year}`);
  if (profile.city) collectedInfo.push(`城市:${profile.city}`);
  if (profile.current_job) collectedInfo.push(`职业:${profile.current_job}`);
  if (profile.mbti) collectedInfo.push(`MBTI:${profile.mbti}`);
  if (profile.education_level) collectedInfo.push(`学历:${profile.education_level}`);
  if (profile.marital_status) collectedInfo.push(`感情:${profile.marital_status}`);
  
  return `你是"猫猫侠"🐱，一个温暖、有趣的AI人生管家。你正在通过对话了解用户，建立人生档案。

【当前状态】建档进度：第${step + 1}步/共10步
【当前话题】${currentTopic}
【已收集信息】${collectedInfo.length > 0 ? collectedInfo.join('，') : '尚未收集'}
${nextTopic ? `【下一话题预告】准备过渡到：${nextTopic}` : '【最后一步】这是最后一个话题了'}

【用户最新消息】"${lastMessage}"

【你的任务】
1. 从用户消息中提取有价值的信息（名字、年龄、城市等）
2. 自然地追问当前话题的更多细节（但不要像审问）
3. 当前话题聊得差不多了，自然过渡到下一个话题
4. 语气温暖、有趣，像朋友聊天
5. 回复不要太长，2-4句话就好
6. 偶尔用"喵~"作为语气词
7. 如果用户说的信息跟当前话题无关，先回应再引导回来

【提取信息格式】
如果从用户消息中提取到了明确信息，在回复末尾用特殊标记：
[EXTRACT:字段名=值]
例如：[EXTRACT:gender=男] [EXTRACT:birth_year=1995] [EXTRACT:city=上海]

可提取的字段：gender, birth_year, city, mbti, education_level, school, major, current_job, industry, job_years, marital_status, living_situation, has_pet, height_cm, weight_kg, sleep_hours_avg, exercise_frequency, personality_traits(逗号分隔), strengths(逗号分隔), weaknesses(逗号分隔), values(逗号分隔), hobbies(逗号分隔), skills(逗号分隔), want_to_learn(逗号分隔), current_challenges(逗号分隔), ideal_life_description, ideal_self_description, bucket_list(逗号分隔)

现在，以猫猫侠的身份回复用户。`;
}

function extractUserInfo(message, step) {
  const extracted = {};
  const msg = message;
  
  // 提取 [EXTRACT:field=value] 标记
  const extractPattern = /\[EXTRACT:(\w+)=(.+?)\]/g;
  let match;
  while ((match = extractPattern.exec(msg)) !== null) {
    const [, field, value] = match;
    if (['height_cm', 'weight_kg', 'sleep_hours_avg', 'job_years', 'birth_year', 'has_pet', 'close_friends_count'].includes(field)) {
      extracted[field] = parseFloat(value) || null;
    } else if (['personality_traits', 'strengths', 'weaknesses', 'values', 'hobbies', 'skills', 'want_to_learn', 'current_challenges', 'bucket_list', 'languages'].includes(field)) {
      extracted[field] = JSON.stringify(value.split(/[,，、]/).map(s => s.trim()).filter(Boolean));
    } else {
      extracted[field] = value.trim();
    }
  }
  
  // 基础模式匹配（作为备用提取）
  if (!extracted.birth_year) {
    const yearMatch = msg.match(/(\d{4})年|(\d{2,3})岁/);
    if (yearMatch) {
      const year = yearMatch[1] || (new Date().getFullYear() - parseInt(yearMatch[2])).toString();
      if (parseInt(year) > 1940 && parseInt(year) < 2010) extracted.birth_year = parseInt(year);
    }
  }
  
  // 城市提取（白名单匹配，避免把行业当城市）
  if (!extracted.city) {
    const cities = '北京 上海 广州 深圳 杭州 成都 武汉 南京 重庆 西安 苏州 天津 长沙 郑州 青岛 厦门 合肥 福州 昆明 贵阳 济南 大连 宁波 东莞 佛山 无锡 温州 珠海 惠州 嘉兴 常州 徐州 金华 南通 绍兴 台州 烟台 廊坊 保定 石家庄 太原 哈尔滨 长春 沈阳 呼和浩特 兰州 乌鲁木齐 拉萨'.split(' ');
    for (const c of cities) { if (msg.includes(c)) { extracted.city = c; break; } }
  }
  
  return extracted;
}

function generateFallbackOnboardingResponse(step, message) {
  const responses = [
    '收到喵~ 那你多大了？在哪个城市生活呀？',
    '了解了~ 你做什么工作？工作几年了？',
    '嗯嗯~ 感情状态怎么样？一个人住还是和家人一起？',
    '身体方面呢？身高体重多少？平时运动吗？睡眠怎么样？',
    '财务方面方便说吗？大概年收入多少？有没有存款或负债？',
    '你觉得自己的性格是什么样的？有什么优势和劣势？',
    '社交方面呢？朋友多吗？和家人关系怎么样？',
    '有什么兴趣爱好？会什么技能？有没有想学的东西？',
    '人生中有什么高光时刻或者遗憾吗？当前最大的挑战是什么？',
    '最后一个问题~ 你理想中的生活是什么样的？死前最想做的事是什么？',
  ];
  
  return `🐱 "${responses[step] || responses[responses.length - 1]}"`;
}

function generateInitialPlan(db, userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const dims = [
    { id: 'health', val: user.stat_health, name: '健康' },
    { id: 'finance', val: user.stat_finance, name: '财务' },
    { id: 'learning', val: user.stat_learning, name: '学习' },
    { id: 'career', val: user.stat_career, name: '职业' },
    { id: 'social', val: user.stat_social, name: '社交' },
    { id: 'mental', val: user.stat_mental, name: '心理' },
    { id: 'habits', val: user.stat_habits, name: '习惯' },
    { id: 'creativity', val: user.stat_creativity, name: '创造' },
  ].sort((a, b) => a.val - b.val);
  
  const stmt = db.prepare(`INSERT INTO life_plans (id, user_id, plan_type, dimension_id, title, description, why, start_date, end_date, key_results, milestones, ai_generated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  
  for (const dim of dims.slice(0, 3)) {
    const id = uuid();
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];
    stmt.run(id, userId, 'quarterly', dim.id, `${dim.name}提升计划`, `针对${dim.name}维度(${dim.val}分)的专项提升`, `${dim.name}是当前最需要关注的维度`, startDate, endDate, JSON.stringify([{title:`${dim.name}属性达到60分`,metric:'属性值',target:60,current:dim.val}]), JSON.stringify([{title:'第一周：建立习惯',date:new Date(Date.now()+7*86400000).toISOString().split('T')[0],completed:false}]));
  }
}

export default router;
