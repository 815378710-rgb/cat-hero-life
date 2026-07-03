-- 猫猫侠 深度人生系统 - 扩展Schema

-- ==========================================
-- 13. 人生档案（深度画像）
-- ==========================================

CREATE TABLE IF NOT EXISTS life_profile (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  
  -- 基础信息
  gender TEXT,
  birth_year INTEGER,
  birth_month INTEGER,
  zodiac TEXT,               -- 星座
  chinese_zodiac TEXT,       -- 生肖
  mbti TEXT,                 -- MBTI性格类型
  blood_type TEXT,
  
  -- 教育与职业
  education_level TEXT,      -- 高中/本科/硕士/博士
  school TEXT,
  major TEXT,
  current_job TEXT,
  current_company TEXT,
  job_years INTEGER,
  industry TEXT,
  annual_income_range TEXT,  -- 收入区间
  
  -- 生活状态
  city TEXT,
  living_situation TEXT,     -- 独居/合租/与家人/与伴侣
  marital_status TEXT,       -- 单身/恋爱/已婚/离异
  has_children INTEGER DEFAULT 0,
  has_pet INTEGER DEFAULT 0,
  pet_type TEXT,
  
  -- 身体状况
  height_cm REAL,
  weight_kg REAL,
  bmi REAL,
  health_conditions TEXT,    -- JSON: 慢性病/过敏/旧伤
  sleep_hours_avg REAL,
  exercise_frequency TEXT,   -- 从不/偶尔/每周1-2次/每周3+次
  smoking TEXT,              -- 从不/已戒/偶尔/经常
  drinking TEXT,             -- 从不/社交/偶尔/经常
  
  -- 财务状况
  total_savings REAL,
  total_debt REAL,
  monthly_fixed_expense REAL,
  has_investment INTEGER DEFAULT 0,
  investment_types TEXT,     -- JSON
  financial_goal TEXT,       -- 短期/中期/长期财务目标
  
  -- 性格与心理
  personality_traits TEXT,   -- JSON: 性格标签
  strengths TEXT,            -- JSON: 优势
  weaknesses TEXT,           -- JSON: 劣势
  fears TEXT,                -- JSON: 恐惧/焦虑
  `values` TEXT,               -- JSON: 核心价值观
  motivation_style TEXT,     -- 内驱/外驱/混合
  
  -- 社交
  close_friends_count INTEGER,
  social_style TEXT,         -- 内向/外向/中间
  relationship_quality TEXT, -- 自评社交质量 1-10
  family_relationship TEXT,
  
  -- 兴趣与技能
  hobbies TEXT,              -- JSON
  skills TEXT,               -- JSON: 已有技能
  want_to_learn TEXT,        -- JSON: 想学的
  languages TEXT,            -- JSON: 语言能力
  
  -- 人生经历关键词
  life_highlights TEXT,      -- JSON: 人生高光时刻
  life_regrets TEXT,         -- JSON: 遗憾
  turning_points TEXT,       -- JSON: 人生转折点
  current_challenges TEXT,   -- JSON: 当前面临的主要挑战
  
  -- 理想人生
  ideal_life_description TEXT,  -- 文字描述理想生活
  ideal_self_description TEXT,  -- 文字描述理想自己
  bucket_list TEXT,             -- JSON: 人生清单/遗愿清单
  
  -- 系统字段
  onboarding_completed INTEGER DEFAULT 0,
  onboarding_step INTEGER DEFAULT 0,
  profile_version INTEGER DEFAULT 1,
  last_deep_review TEXT,     -- 上次深度复盘日期
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- 14. AI记忆系统
-- ==========================================

CREATE TABLE IF NOT EXISTS ai_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  
  memory_type TEXT NOT NULL,  -- conversation/event/insight/decision/milestone/emotion
  
  -- 内容
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,              -- 一句话摘要
  
  -- 关联
  dimension_id TEXT,         -- 关联维度
  related_memory_id TEXT,    -- 关联的其他记忆
  
  -- 情绪标签
  emotion_tag TEXT,          -- happy/sad/anxious/proud/frustrated/excited/calm
  emotion_intensity INTEGER, -- 1-5
  
  -- 重要性
  importance INTEGER DEFAULT 5,  -- 1-10
  is_milestone INTEGER DEFAULT 0,
  
  -- 来源
  source TEXT,               -- chat/checkin/task/event/system
  
  -- 时间
  event_time TEXT,           -- 事件实际发生时间
  created_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- 15. 人生规划
-- ==========================================

CREATE TABLE IF NOT EXISTS life_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  
  -- 规划层级
  plan_type TEXT NOT NULL,   -- vision/annual/quarterly/monthly/weekly
  dimension_id TEXT,
  
  -- 内容
  title TEXT NOT NULL,
  description TEXT,
  why TEXT,                  -- 为什么要做这个
  
  -- 时间范围
  start_date TEXT,
  end_date TEXT,
  
  -- 目标拆解
  key_results TEXT,          -- JSON: 关键结果 [{title, metric, target, current}]
  milestones TEXT,           -- JSON: 里程碑 [{title, date, completed}]
  
  -- 状态
  status TEXT DEFAULT 'active',  -- active/completed/paused/revised
  progress REAL DEFAULT 0,       -- 0-100
  
  -- AI生成标记
  ai_generated INTEGER DEFAULT 0,
  user_confirmed INTEGER DEFAULT 0,
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- 16. 每日AI对话日志（增强版）
-- ==========================================

CREATE TABLE IF NOT EXISTS daily_ai_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  log_date TEXT NOT NULL,
  
  -- AI主动发起的内容
  morning_greeting TEXT,      -- 早安问候+今日重点
  midday_check TEXT,          -- 午间检查
  evening_review TEXT,        -- 晚间复盘
  random_events TEXT,         -- JSON: 今日随机触发的事件
  
  -- 用户反馈
  user_morning_response TEXT,
  user_midday_response TEXT,
  user_evening_response TEXT,
  overall_mood TEXT,          -- 今日整体情绪
  energy_level INTEGER,       -- 精力 1-5
  
  -- AI分析
  ai_observation TEXT,        -- AI对今日的观察
  ai_suggestion TEXT,         -- AI对明日的建议
  
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, log_date)
);

-- ==========================================
-- 17. 人生叙事线
-- ==========================================

CREATE TABLE IF NOT EXISTS life_narrative (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  
  -- 叙事节点
  chapter_title TEXT NOT NULL,   -- 章节标题
  chapter_number INTEGER,        -- 第几章
  narrative_text TEXT NOT NULL,  -- 叙事文本（小说风格）
  
  -- 关联
  related_memories TEXT,         -- JSON: 关联的记忆ID
  related_achievements TEXT,     -- JSON: 关联的成就
  dimension_focus TEXT,          -- 主要维度
  
  -- 情绪弧
  emotion_arc TEXT,              -- 起始情绪->结束情绪
  
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- 18. 系统对话（AI主动发起）
-- ==========================================

CREATE TABLE IF NOT EXISTS system_dialogues (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  
  dialogue_type TEXT NOT NULL,   -- morning/noon/evening/event/milestone/concern/random
  trigger_reason TEXT,           -- 触发原因
  
  -- 对话内容
  ai_message TEXT NOT NULL,
  user_response TEXT,
  
  -- 状态
  status TEXT DEFAULT 'pending', -- pending/responded/expired
  expires_at TEXT,
  
  created_at TEXT DEFAULT (datetime('now')),
  responded_at TEXT,
  
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS ai_config (id INTEGER PRIMARY KEY, provider TEXT, api_key TEXT, model TEXT, updated_at TEXT DEFAULT (datetime('now')));
