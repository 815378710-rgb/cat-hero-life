-- 猫猫侠 深度维度数据表

-- ==========================================
-- 健康详细数据
-- ==========================================

-- 身体指标记录
CREATE TABLE IF NOT EXISTS health_body (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  record_date TEXT NOT NULL,
  weight_kg REAL,
  height_cm REAL,
  bmi REAL,
  body_fat_percent REAL,
  muscle_mass_kg REAL,
  waist_cm REAL,
  blood_pressure_sys INTEGER,
  blood_pressure_dia INTEGER,
  heart_rate INTEGER,
  blood_sugar REAL,
  temperature REAL,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 睡眠记录
CREATE TABLE IF NOT EXISTS health_sleep (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  sleep_date TEXT NOT NULL,
  bedtime TEXT,            -- 入睡时间 HH:MM
  wake_time TEXT,          -- 起床时间 HH:MM
  duration_hours REAL,     -- 睡眠时长
  quality INTEGER,         -- 1-5
  deep_sleep_hours REAL,   -- 深度睡眠
  dreams INTEGER DEFAULT 0, -- 是否做梦
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 运动记录
CREATE TABLE IF NOT EXISTS health_exercise (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exercise_date TEXT NOT NULL,
  exercise_type TEXT NOT NULL,  -- 跑步/游泳/健身/瑜伽/散步/球类
  duration_minutes INTEGER,
  calories_burned INTEGER,
  distance_km REAL,
  intensity TEXT,               -- 低/中/高
  heart_rate_avg INTEGER,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 饮食记录
CREATE TABLE IF NOT EXISTS health_diet (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  diet_date TEXT NOT NULL,
  meal_type TEXT NOT NULL,    -- 早餐/午餐/晚餐/加餐
  food_description TEXT,
  calories INTEGER,
  protein_g REAL,
  carbs_g REAL,
  fat_g REAL,
  water_ml INTEGER,
  mood_after TEXT,            -- 饭后感受
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 医疗记录
CREATE TABLE IF NOT EXISTS health_medical (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  record_type TEXT NOT NULL,  -- condition/allergy/medication/checkup/vaccine
  title TEXT NOT NULL,
  description TEXT,
  doctor TEXT,
  hospital TEXT,
  date TEXT,
  next_date TEXT,             -- 下次复查日期
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- 财务详细数据
-- ==========================================

-- 收支记录
CREATE TABLE IF NOT EXISTS finance_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  type TEXT NOT NULL,         -- income/expense
  category TEXT NOT NULL,     -- 餐饮/交通/娱乐/购物/房租/水电/工资/副业/投资收益
  amount REAL NOT NULL,
  description TEXT,
  payment_method TEXT,        -- 现金/微信/支付宝/银行卡
  is_recurring INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 账户资产
CREATE TABLE IF NOT EXISTS finance_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_name TEXT NOT NULL,  -- 现金/银行卡/支付宝/微信/股票账户
  account_type TEXT,           -- cash/bank/investment/other
  balance REAL DEFAULT 0,
  currency TEXT DEFAULT 'CNY',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 投资记录
CREATE TABLE IF NOT EXISTS finance_investments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  investment_type TEXT NOT NULL, -- stock/fund/crypto/realestate/other
  name TEXT NOT NULL,
  amount_invested REAL,
  current_value REAL,
  return_rate REAL,
  purchase_date TEXT,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 预算
CREATE TABLE IF NOT EXISTS finance_budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  monthly_limit REAL NOT NULL,
  month TEXT NOT NULL,         -- YYYY-MM
  spent REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, category, month)
);

-- ==========================================
-- 学习详细数据
-- ==========================================

-- 技能清单
CREATE TABLE IF NOT EXISTS learning_skills (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  category TEXT,               -- 编程/设计/语言/音乐/运动/其他
  proficiency INTEGER DEFAULT 1, -- 1-10
  target_proficiency INTEGER,
  hours_invested REAL DEFAULT 0,
  is_learning INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 学习记录
CREATE TABLE IF NOT EXISTS learning_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  log_date TEXT NOT NULL,
  skill_id TEXT,
  activity_type TEXT,          -- 看书/看视频/练习/项目/课程
  content_description TEXT,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (skill_id) REFERENCES learning_skills(id)
);

-- 书籍/课程
CREATE TABLE IF NOT EXISTS learning_resources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  resource_type TEXT NOT NULL, -- book/course/tutorial/certification
  title TEXT NOT NULL,
  author TEXT,
  category TEXT,
  status TEXT DEFAULT 'want',  -- want/reading/completed/abandoned
  progress_percent INTEGER DEFAULT 0,
  start_date TEXT,
  completion_date TEXT,
  rating INTEGER,              -- 1-5
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- 职业详细数据
-- ==========================================

-- 职业经历
CREATE TABLE IF NOT EXISTS career_experience (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  industry TEXT,
  start_date TEXT,
  end_date TEXT,
  salary REAL,
  description TEXT,
  achievements TEXT,           -- JSON: 工作成就
  is_current INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 职业目标
CREATE TABLE IF NOT EXISTS career_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  goal_type TEXT,              -- short/medium/long (1年/3年/10年)
  title TEXT NOT NULL,
  description TEXT,
  target_date TEXT,
  action_plan TEXT,            -- JSON: 行动计划
  progress INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 人脉记录
CREATE TABLE IF NOT EXISTS career_network (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  relationship TEXT,           -- 同事/上司/客户/行业人脉/导师
  company TEXT,
  position TEXT,
  contact_info TEXT,
  last_contact_date TEXT,
  contact_frequency TEXT,      -- 每周/每月/每季度/每年
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- 社交详细数据
-- ==========================================

-- 关系清单
CREATE TABLE IF NOT EXISTS social_relationships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  relationship_type TEXT,      -- friend/family/colleague/partner/mentor
  closeness INTEGER,           -- 1-5
  last_contact TEXT,
  contact_frequency TEXT,
  birthday TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 社交活动
CREATE TABLE IF NOT EXISTS social_activities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  activity_type TEXT,          -- 聚会/电话/消息/旅行/运动
  people_involved TEXT,        -- JSON: 参与人
  description TEXT,
  duration_minutes INTEGER,
  enjoyment INTEGER,           -- 1-5
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- 心理详细数据
-- ==========================================

-- 情绪日记
CREATE TABLE IF NOT EXISTS mental_mood_diary (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  diary_date TEXT NOT NULL,
  mood_score INTEGER NOT NULL, -- 1-5
  mood_tags TEXT,              -- JSON: 开心/焦虑/平静/愤怒/悲伤/兴奋
  energy_level INTEGER,        -- 1-5
  stress_level INTEGER,        -- 1-5
  trigger_events TEXT,         -- 触发事件
  coping_methods TEXT,         -- 应对方式
  gratitude TEXT,              -- 感恩的事
  reflection TEXT,             -- 反思
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 冥想记录
CREATE TABLE IF NOT EXISTS mental_meditation (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  meditation_date TEXT NOT NULL,
  duration_minutes INTEGER,
  meditation_type TEXT,        -- 呼吸/正念/引导/身体扫描
  quality INTEGER,             -- 1-5
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- 创造详细数据
-- ==========================================

-- 创作项目
CREATE TABLE IF NOT EXISTS creative_projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  project_type TEXT,           -- 写作/绘画/编程/摄影/音乐/视频/手工
  description TEXT,
  status TEXT DEFAULT 'active', -- idea/active/completed/paused
  progress INTEGER DEFAULT 0,
  start_date TEXT,
  target_date TEXT,
  hours_invested REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 灵感库
CREATE TABLE IF NOT EXISTS creative_ideas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  idea_text TEXT NOT NULL,
  category TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'new',   -- new/developing/implemented/archived
  related_project_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (related_project_id) REFERENCES creative_projects(id)
);

-- 创作产出
CREATE TABLE IF NOT EXISTS creative_outputs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  output_type TEXT,            -- 文章/代码/画作/照片/视频/音乐
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  project_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES creative_projects(id)
);
