import { Router } from 'express';
import { v4 as uuid } from 'uuid';

const router = Router();

// 获取人生档案
router.get('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    let profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    if (!profile) {
      db.prepare('INSERT INTO life_profile (id, user_id) VALUES (?, ?)').run(uuid(), user.id);
      profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    }
    res.json({ profile });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 更新档案（分步填写）
router.put('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const fields = req.body;
    
    // 动态构建 UPDATE 语句
    const allowedFields = [
      'gender','birth_year','birth_month','zodiac','chinese_zodiac','mbti','blood_type',
      'education_level','school','major','current_job','current_company','job_years','industry','annual_income_range',
      'city','living_situation','marital_status','has_children','has_pet','pet_type',
      'height_cm','weight_kg','bmi','health_conditions','sleep_hours_avg','exercise_frequency','smoking','drinking',
      'total_savings','total_debt','monthly_fixed_expense','has_investment','investment_types','financial_goal',
      'personality_traits','strengths','weaknesses','fears','values','motivation_style',
      'close_friends_count','social_style','relationship_quality','family_relationship',
      'hobbies','skills','want_to_learn','languages',
      'life_highlights','life_regrets','turning_points','current_challenges',
      'ideal_life_description','ideal_self_description','bucket_list',
      'onboarding_completed','onboarding_step'
    ];
    
    const updates = [];
    const params = [];
    for (const [key, value] of Object.entries(fields)) {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = ?`);
        params.push(typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }
    
    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(user.id);
      db.prepare(`UPDATE life_profile SET ${updates.join(', ')} WHERE user_id = ?`).run(...params);
    }
    
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取开局问卷问题
router.get('/onboarding-questions', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT onboarding_step FROM life_profile WHERE user_id = ?').get(user.id);
    const step = profile?.onboarding_step || 0;
    
    const questions = getOnboardingQuestions();
    const currentBatch = questions.filter(q => q.step === step);
    const totalSteps = Math.max(...questions.map(q => q.step)) + 1;
    
    res.json({ 
      step, 
      total_steps: totalSteps, 
      questions: currentBatch,
      progress: ((step / totalSteps) * 100).toFixed(0)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 提交开局问卷答案
router.post('/onboarding-answer', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { answers } = req.body; // {field: value, ...}
    
    // 更新档案
    const profile = db.prepare('SELECT onboarding_step FROM life_profile WHERE user_id = ?').get(user.id);
    const currentStep = profile?.onboarding_step || 0;
    
    // 保存答案
    const updates = [];
    const params = [];
    for (const [key, value] of Object.entries(answers)) {
      updates.push(`${key} = ?`);
      params.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }
    
    if (updates.length > 0) {
      updates.push('onboarding_step = ?');
      params.push(currentStep + 1);
      updates.push("updated_at = datetime('now')");
      params.push(user.id);
      db.prepare(`UPDATE life_profile SET ${updates.join(', ')} WHERE user_id = ?`).run(...params);
    }
    
    // 检查是否完成
    const questions = getOnboardingQuestions();
    const totalSteps = Math.max(...questions.map(q => q.step)) + 1;
    const isComplete = currentStep + 1 >= totalSteps;
    
    if (isComplete) {
      db.prepare("UPDATE life_profile SET onboarding_completed = 1 WHERE user_id = ?").run(user.id);
      // 生成初始人生规划
      generateInitialPlan(db, user.id);
    }
    
    res.json({ 
      success: true, 
      next_step: currentStep + 1, 
      completed: isComplete,
      message: isComplete ? '🎉 档案建立完成！猫猫侠现在了解你了，让我为你规划人生吧~' : `继续下一步喵~ (${currentStep + 1}/${totalSteps})`
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 生成人生档案摘要（AI用）
router.get('/summary', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    if (!profile) return res.json({ summary: '尚未建立档案' });
    
    const summary = buildProfileSummary(user, profile);
    res.json({ summary });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function buildProfileSummary(user, p) {
  const parts = [];
  
  parts.push(`【基本信息】${p.gender || '未知'}，${p.birth_year ? (new Date().getFullYear() - p.birth_year) + '岁' : '年龄未知'}，${p.city || '城市未知'}，${p.mbti || ''}`);
  
  if (p.current_job) parts.push(`【职业】${p.current_job}${p.current_company ? '@' + p.current_company : ''}，${p.industry || ''}行业，工作${p.job_years || '?'}年`);
  if (p.education_level) parts.push(`【学历】${p.education_level}${p.school ? ' - ' + p.school : ''}${p.major ? ' ' + p.major : ''}`);
  
  if (p.height_cm || p.weight_kg) parts.push(`【身体】${p.height_cm || '?'}cm / ${p.weight_kg || '?'}kg，睡眠${p.sleep_hours_avg || '?'}h，运动${p.exercise_frequency || '未知'}`);
  
  if (p.marital_status) parts.push(`【生活】${p.marital_status}，${p.living_situation || ''}${p.has_pet ? '，有宠物(' + (p.pet_type || '') + ')' : ''}`);
  
  if (p.total_savings || p.total_debt) parts.push(`【财务】存款${p.total_savings || 0}元，负债${p.total_debt || 0}元，月固定支出${p.monthly_fixed_expense || 0}元`);
  
  if (p.personality_traits) {
    try { parts.push(`【性格】${JSON.parse(p.personality_traits).join('、')}`); } catch {}
  }
  if (p.strengths) {
    try { parts.push(`【优势】${JSON.parse(p.strengths).join('、')}`); } catch {}
  }
  if (p.weaknesses) {
    try { parts.push(`【劣势】${JSON.parse(p.weaknesses).join('、')}`); } catch {}
  }
  if (p.values) {
    try { parts.push(`【价值观】${JSON.parse(p.values).join('、')}`); } catch {}
  }
  
  if (p.current_challenges) {
    try { parts.push(`【当前挑战】${JSON.parse(p.current_challenges).join('、')}`); } catch {}
  }
  
  if (p.ideal_life_description) parts.push(`【理想生活】${p.ideal_life_description}`);
  if (p.ideal_self_description) parts.push(`【理想自己】${p.ideal_self_description}`);
  
  if (p.life_highlights) {
    try { parts.push(`【人生高光】${JSON.parse(p.life_highlights).join('、')}`); } catch {}
  }
  if (p.life_regrets) {
    try { parts.push(`【人生遗憾】${JSON.parse(p.life_regrets).join('、')}`); } catch {}
  }
  if (p.turning_points) {
    try { parts.push(`【转折点】${JSON.parse(p.turning_points).join('、')}`); } catch {}
  }
  
  if (p.bucket_list) {
    try { parts.push(`【人生清单】${JSON.parse(p.bucket_list).join('、')}`); } catch {}
  }
  
  if (p.hobbies) {
    try { parts.push(`【兴趣爱好】${JSON.parse(p.hobbies).join('、')}`); } catch {}
  }
  if (p.skills) {
    try { parts.push(`【已有技能】${JSON.parse(p.skills).join('、')}`); } catch {}
  }
  if (p.want_to_learn) {
    try { parts.push(`【想学的】${JSON.parse(p.want_to_learn).join('、')}`); } catch {}
  }
  
  // 游戏化数据
  parts.push(`【系统状态】Lv.${user.level}，${user.total_exp}总经验，${user.coins}金币，连续签到${user.consecutive_sign_days}天`);
  parts.push(`【属性】健康${user.stat_health} 财务${user.stat_finance} 学习${user.stat_learning} 职业${user.stat_career} 社交${user.stat_social} 心理${user.stat_mental} 习惯${user.stat_habits} 创造${user.stat_creativity}`);
  
  return parts.join('\n');
}

function generateInitialPlan(db, userId) {
  const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
  if (!profile) return;
  
  // 基于档案生成初始人生规划
  const plans = [];
  
  // 分析最弱维度，生成针对性规划
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
  
  // 为最弱的3个维度生成规划
  for (const dim of dims.slice(0, 3)) {
    plans.push({
      id: uuid(), user_id: userId,
      plan_type: 'quarterly', dimension_id: dim.id,
      title: `${dim.name}提升计划`,
      description: `针对当前${dim.name}属性(${dim.val}分)的专项提升计划`,
      why: `${dim.name}是你当前最需要关注的维度`,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
      key_results: JSON.stringify([
        { title: `${dim.name}属性达到60分`, metric: '属性值', target: 60, current: dim.val },
        { title: `连续打卡30天`, metric: '天数', target: 30, current: 0 },
      ]),
      milestones: JSON.stringify([
        { title: '第一周：建立习惯', date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0], completed: false },
        { title: '第一个月：稳定执行', date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0], completed: false },
        { title: '三个月：质的飞跃', date: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0], completed: false },
      ]),
      ai_generated: 1, user_confirmed: 0
    });
  }
  
  // 如果有理想生活描述，生成愿景规划
  if (profile.ideal_life_description) {
    plans.push({
      id: uuid(), user_id: userId,
      plan_type: 'vision', dimension_id: null,
      title: '人生愿景',
      description: profile.ideal_life_description,
      why: '这是你描述的理想生活，是所有规划的终点',
      key_results: JSON.stringify([]),
      milestones: JSON.stringify([]),
      ai_generated: 1, user_confirmed: 0
    });
  }
  
  const stmt = db.prepare(`INSERT INTO life_plans (id, user_id, plan_type, dimension_id, title, description, why, start_date, end_date, key_results, milestones, ai_generated, user_confirmed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const p of plans) {
    stmt.run(p.id, p.user_id, p.plan_type, p.dimension_id, p.title, p.description, p.why, p.start_date || null, p.end_date || null, p.key_results, p.milestones, p.ai_generated, p.user_confirmed);
  }
  
  // 记录AI记忆
  db.prepare(`INSERT INTO ai_memory (id, user_id, memory_type, title, content, importance, is_milestone, source) VALUES (?, ?, 'milestone', '人生档案建立', ?, 9, 1, 'system')`)
    .run(uuid(), userId, `用户完成了人生档案建立。最需要关注的维度：${dims.slice(0, 3).map(d => d.name).join('、')}。已生成初始人生规划。`);
}

function getOnboardingQuestions() {
  return [
    // Step 0: 基础信息
    { step: 0, section: '基础信息', fields: [
      { key: 'gender', label: '性别', type: 'select', options: ['男', '女', '其他'] },
      { key: 'birth_year', label: '出生年份', type: 'number', placeholder: '例如：1995' },
      { key: 'city', label: '所在城市', type: 'text', placeholder: '例如：上海' },
      { key: 'mbti', label: 'MBTI性格类型（如果知道的话）', type: 'text', placeholder: '例如：INTJ，不知道可以跳过' },
    ]},
    // Step 1: 教育与职业
    { step: 1, section: '教育与职业', fields: [
      { key: 'education_level', label: '学历', type: 'select', options: ['高中及以下', '大专', '本科', '硕士', '博士'] },
      { key: 'school', label: '学校（选填）', type: 'text', placeholder: '例如：北京大学' },
      { key: 'major', label: '专业（选填）', type: 'text', placeholder: '例如：计算机科学' },
      { key: 'current_job', label: '当前职业/工作', type: 'text', placeholder: '例如：前端工程师' },
      { key: 'industry', label: '所在行业', type: 'text', placeholder: '例如：互联网' },
      { key: 'job_years', label: '工作年限', type: 'number', placeholder: '例如：3' },
    ]},
    // Step 2: 生活状态
    { step: 2, section: '生活状态', fields: [
      { key: 'marital_status', label: '感情状态', type: 'select', options: ['单身', '恋爱中', '已婚', '离异'] },
      { key: 'living_situation', label: '居住状态', type: 'select', options: ['独居', '合租', '与家人同住', '与伴侣同住'] },
      { key: 'has_pet', label: '有宠物吗？', type: 'select', options: [{ label: '有', value: 1 }, { label: '没有', value: 0 }] },
    ]},
    // Step 3: 身体状况
    { step: 3, section: '身体状况', fields: [
      { key: 'height_cm', label: '身高(cm)', type: 'number', placeholder: '例如：175' },
      { key: 'weight_kg', label: '体重(kg)', type: 'number', placeholder: '例如：70' },
      { key: 'sleep_hours_avg', label: '平均每天睡眠(小时)', type: 'number', placeholder: '例如：7' },
      { key: 'exercise_frequency', label: '运动频率', type: 'select', options: ['从不运动', '偶尔运动', '每周1-2次', '每周3次以上'] },
    ]},
    // Step 4: 财务概况
    { step: 4, section: '财务概况', fields: [
      { key: 'annual_income_range', label: '年收入区间', type: 'select', options: ['5万以下', '5-10万', '10-20万', '20-50万', '50-100万', '100万以上'] },
      { key: 'total_savings', label: '当前存款（元，选填）', type: 'number', placeholder: '大概数字即可' },
      { key: 'total_debt', label: '当前负债（元，选填）', type: 'number', placeholder: '房贷车贷等' },
      { key: 'monthly_fixed_expense', label: '月固定支出（元）', type: 'number', placeholder: '房租+生活费等' },
    ]},
    // Step 5: 性格与内心
    { step: 5, section: '性格与内心', fields: [
      { key: 'personality_traits', label: '用3-5个词描述你的性格', type: 'tags', placeholder: '例如：内向、认真、拖延、善良' },
      { key: 'strengths', label: '你觉得自己最大的优势是什么？', type: 'tags', placeholder: '例如：学习能力强、执行力高' },
      { key: 'weaknesses', label: '你觉得自己最大的劣势是什么？', type: 'tags', placeholder: '例如：拖延、社交恐惧' },
      { key: 'values', label: '你最看重什么？', type: 'tags', placeholder: '例如：自由、家庭、成就感、金钱' },
    ]},
    // Step 6: 社交
    { step: 6, section: '社交关系', fields: [
      { key: 'social_style', label: '社交风格', type: 'select', options: ['偏内向', '偏外向', '看情况'] },
      { key: 'close_friends_count', label: '亲密好友数量', type: 'number', placeholder: '能说心里话的朋友' },
      { key: 'family_relationship', label: '和家人的关系如何？', type: 'text', placeholder: '简单描述一下' },
    ]},
    // Step 7: 兴趣与技能
    { step: 7, section: '兴趣与技能', fields: [
      { key: 'hobbies', label: '你的兴趣爱好', type: 'tags', placeholder: '例如：游戏、摄影、做饭、跑步' },
      { key: 'skills', label: '你已经掌握的技能', type: 'tags', placeholder: '例如：Python、PS、英语' },
      { key: 'want_to_learn', label: '你想要学习的技能', type: 'tags', placeholder: '例如：吉他、投资、写作' },
      { key: 'languages', label: '你会的语言', type: 'tags', placeholder: '例如：中文、英语' },
    ]},
    // Step 8: 人生经历
    { step: 8, section: '人生经历', fields: [
      { key: 'life_highlights', label: '你的人生高光时刻', type: 'tags', placeholder: '例如：考上大学、第一次旅行、创业成功' },
      { key: 'life_regrets', label: '你有什么遗憾？', type: 'tags', placeholder: '例如：没早点学英语、错过一个人' },
      { key: 'turning_points', label: '人生转折点', type: 'tags', placeholder: '例如：毕业、换城市、分手' },
      { key: 'current_challenges', label: '当前面临的最大挑战', type: 'tags', placeholder: '例如：职业瓶颈、健康问题、孤独感' },
    ]},
    // Step 9: 理想人生
    { step: 9, section: '理想人生', fields: [
      { key: 'ideal_life_description', label: '描述你理想中的生活', type: 'textarea', placeholder: '想象5年后/10年后，你过着什么样的生活？住在哪里？做什么工作？身边有谁？' },
      { key: 'ideal_self_description', label: '描述你理想中的自己', type: 'textarea', placeholder: '你想成为什么样的人？有什么能力？什么性格？' },
      { key: 'bucket_list', label: '你的人生清单（死前想做的事）', type: 'tags', placeholder: '例如：环游世界、写一本书、跑马拉松' },
    ]},
  ];
}

export default router;
