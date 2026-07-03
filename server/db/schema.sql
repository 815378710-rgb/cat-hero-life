-- 猫猫侠 AI人生管理系统 - 数据库Schema
-- SQLite

-- ==========================================
-- 1. 用户系统
-- ==========================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '主人',
  avatar_url TEXT,
  personality_type TEXT DEFAULT 'encouraging', -- encouraging/strict/funny/custom
  personality_prompt TEXT,                      -- 自定义性格提示词
  
  -- 财务信息
  monthly_income REAL DEFAULT 0,
  monthly_budget REAL DEFAULT 0,
  reward_pool_percent REAL DEFAULT 5,           -- 奖励池占收入百分比
  
  -- 基础属性 (0-100)
  stat_health INTEGER DEFAULT 30,
  stat_finance INTEGER DEFAULT 20,
  stat_learning INTEGER DEFAULT 25,
  stat_career INTEGER DEFAULT 30,
  stat_social INTEGER DEFAULT 25,
  stat_mental INTEGER DEFAULT 30,
  stat_habits INTEGER DEFAULT 20,
  stat_creativity INTEGER DEFAULT 25,
  
  -- 游戏化
  level INTEGER DEFAULT 1,
  exp INTEGER DEFAULT 0,
  coins INTEGER DEFAULT 0,
  total_exp INTEGER DEFAULT 0,
  
  -- 签到
  consecutive_sign_days INTEGER DEFAULT 0,
  last_sign_date TEXT,
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ==========================================
-- 2. 人生维度定义
-- ==========================================

CREATE TABLE IF NOT EXISTS life_dimensions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0
);

-- ==========================================
-- 3. 目标系统
-- ==========================================

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  dimension_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_value REAL,              -- 目标值
  current_value REAL DEFAULT 0,   -- 当前值
  unit TEXT,                      -- 单位(次/kg/天/元等)
  deadline TEXT,                  -- 截止日期
  priority TEXT DEFAULT 'medium', -- low/medium/high/critical
  status TEXT DEFAULT 'active',   -- active/completed/paused/abandoned
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (dimension_id) REFERENCES life_dimensions(id)
);

-- ==========================================
-- 4. 任务系统
-- ==========================================

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  goal_id TEXT,                   -- 关联目标(可选)
  dimension_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT DEFAULT 'daily', -- daily/weekly/monthly/one_time/event
  difficulty TEXT DEFAULT 'medium', -- easy/medium/hard/epic
  
  -- 奖励
  exp_reward INTEGER DEFAULT 10,
  coin_reward INTEGER DEFAULT 5,
  
  -- 状态
  status TEXT DEFAULT 'pending',  -- pending/in_progress/completed/failed/skipped
  scheduled_date TEXT,            -- 计划日期
  completed_at TEXT,
  
  -- 重复规则
  repeat_rule TEXT,               -- JSON: {type:"daily", days:[1,2,3,4,5]}
  
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (goal_id) REFERENCES goals(id),
  FOREIGN KEY (dimension_id) REFERENCES life_dimensions(id)
);

-- ==========================================
-- 5. 打卡记录
-- ==========================================

CREATE TABLE IF NOT EXISTS check_ins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id TEXT,
  dimension_id TEXT NOT NULL,
  check_type TEXT NOT NULL,       -- task/manual/habit
  title TEXT NOT NULL,
  value REAL,                     -- 数值(如喝水ml, 运动分钟)
  note TEXT,
  mood INTEGER,                   -- 1-5 心情
  energy INTEGER,                 -- 1-5 精力
  checked_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (dimension_id) REFERENCES life_dimensions(id)
);

-- ==========================================
-- 6. 成就系统
-- ==========================================

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT,                  -- 维度类别
  condition_type TEXT NOT NULL,   -- streak/total/level/first/special
  condition_value INTEGER,
  condition_meta TEXT,            -- JSON额外条件
  exp_reward INTEGER DEFAULT 50,
  coin_reward INTEGER DEFAULT 20,
  rarity TEXT DEFAULT 'common',   -- common/rare/epic/legendary
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (achievement_id) REFERENCES achievements(id),
  UNIQUE(user_id, achievement_id)
);

-- ==========================================
-- 7. 商店系统
-- ==========================================

CREATE TABLE IF NOT EXISTS shop_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT,                  -- reward/experience/cosmetic/real
  price INTEGER NOT NULL,         -- 金币价格
  item_type TEXT,                 -- virtual/real_reward
  real_reward_desc TEXT,          -- 真实奖励描述
  stock INTEGER DEFAULT -1,       -- -1为无限
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  price_paid INTEGER,
  status TEXT DEFAULT 'pending',  -- pending/used/expired
  purchased_at TEXT DEFAULT (datetime('now')),
  used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (item_id) REFERENCES shop_items(id)
);

-- ==========================================
-- 8. 事件/剧情系统
-- ==========================================

CREATE TABLE IF NOT EXISTS story_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT,                -- random/seasonal/milestone/challenge
  dimension_id TEXT,
  trigger_condition TEXT,         -- JSON触发条件
  choices TEXT,                   -- JSON选项 [{text, exp, coins, stat_change}]
  exp_reward INTEGER DEFAULT 0,
  coin_reward INTEGER DEFAULT 0,
  stat_effects TEXT,              -- JSON属性变化
  is_active INTEGER DEFAULT 1,
  rarity TEXT DEFAULT 'common',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  choice_made TEXT,
  resolved_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (event_id) REFERENCES story_events(id)
);

-- ==========================================
-- 9. AI对话历史
-- ==========================================

CREATE TABLE IF NOT EXISTS chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,             -- user/assistant/system
  content TEXT NOT NULL,
  metadata TEXT,                  -- JSON: 情绪分析,意图识别等
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- 10. 每日报告
-- ==========================================

CREATE TABLE IF NOT EXISTS daily_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  summary TEXT,                   -- AI生成的日报
  stats_snapshot TEXT,            -- JSON属性快照
  tasks_completed INTEGER DEFAULT 0,
  tasks_total INTEGER DEFAULT 0,
  exp_gained INTEGER DEFAULT 0,
  coins_gained INTEGER DEFAULT 0,
  mood_avg REAL,
  highlights TEXT,                -- JSON亮点
  suggestions TEXT,               -- JSON建议
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, report_date)
);

-- ==========================================
-- 11. AI进化数据
-- ==========================================

CREATE TABLE IF NOT EXISTS ai_insights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  insight_type TEXT,              -- pattern/weakness/strength/suggestion
  dimension_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  confidence REAL DEFAULT 0.5,   -- 置信度 0-1
  data TEXT,                      -- JSON支撑数据
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- 12. 习惯追踪
-- ==========================================

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  dimension_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  frequency TEXT DEFAULT 'daily', -- daily/weekly
  target_count INTEGER DEFAULT 1,
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  icon TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (dimension_id) REFERENCES life_dimensions(id)
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  logged_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (habit_id) REFERENCES habits(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ==========================================
-- 初始数据：人生维度
-- ==========================================

INSERT OR IGNORE INTO life_dimensions (id, name, icon, color, description, sort_order) VALUES
  ('health', '健康/运动/饮食', '🏋️', '#FF6B6B', '身体是一切的基础', 1),
  ('finance', '财务/理财', '💰', '#4ECDC4', '财务自由从记账开始', 2),
  ('learning', '学习/技能提升', '📚', '#45B7D1', '终身学习者', 3),
  ('career', '职业/事业', '💼', '#96CEB4', '事业成长规划', 4),
  ('social', '人际关系/社交', '❤️', '#FFEAA7', '经营你的社交圈', 5),
  ('mental', '心理/情绪管理', '🧘', '#DDA0DD', '内心的力量', 6),
  ('habits', '目标与习惯养成', '🎯', '#F0E68C', '微习惯，大改变', 7),
  ('creativity', '兴趣爱好/创造力', '🎨', '#FFB347', '保持创造力', 8);

-- ==========================================
-- 初始数据：成就
-- ==========================================

INSERT OR IGNORE INTO achievements (id, name, description, icon, category, condition_type, condition_value, exp_reward, coin_reward, rarity) VALUES
  ('first_step', '第一步', '完成第一个任务', '👣', NULL, 'total', 1, 50, 20, 'common'),
  ('sign_3', '三日签到达人', '连续签到3天', '📅', NULL, 'streak', 3, 80, 30, 'common'),
  ('sign_7', '周周不断', '连续签到7天', '🔥', NULL, 'streak', 7, 150, 60, 'rare'),
  ('sign_30', '月度坚持王', '连续签到30天', '👑', NULL, 'streak', 30, 500, 200, 'epic'),
  ('sign_100', '百日传奇', '连续签到100天', '⭐', NULL, 'streak', 100, 1500, 600, 'legendary'),
  ('level_5', '初露锋芒', '达到5级', '🌟', NULL, 'level', 5, 100, 40, 'common'),
  ('level_10', '小有成就', '达到10级', '💫', NULL, 'level', 10, 200, 80, 'rare'),
  ('level_25', '人生大师', '达到25级', '🏆', NULL, 'level', 25, 500, 200, 'epic'),
  ('level_50', '传奇人生', '达到50级', '💎', NULL, 'level', 50, 1500, 600, 'legendary'),
  ('task_10', '行动派', '累计完成10个任务', '⚡', NULL, 'total', 10, 100, 40, 'common'),
  ('task_50', '效率达人', '累计完成50个任务', '🚀', NULL, 'total', 50, 300, 120, 'rare'),
  ('task_100', '百任勇士', '累计完成100个任务', '🎖️', NULL, 'total', 100, 600, 240, 'epic'),
  ('health_streak_7', '健康一周', '健康维度连续7天打卡', '💪', 'health', 'streak', 7, 150, 60, 'rare'),
  ('finance_first', '理财新手', '第一次记录财务', '💵', 'finance', 'first', 1, 50, 20, 'common'),
  ('learning_streak_7', '学霸模式', '学习维度连续7天打卡', '📖', 'learning', 'streak', 7, 150, 60, 'rare'),
  ('social_first', '社交达人', '第一次记录社交活动', '🤝', 'social', 'first', 1, 50, 20, 'common'),
  ('mental_check', '内观者', '第一次记录心理状态', '🧘', 'mental', 'first', 1, 50, 20, 'common'),
  ('creative_first', '创造者', '第一次记录创作活动', '🎨', 'creativity', 'first', 1, 50, 20, 'common'),
  ('health_7', '健康达人', '健康属性达到70', '💪', 'health', 'level', 70, 200, 80, 'rare'),
  ('finance_7', '理财达人', '财务属性达到70', '💰', 'finance', 'level', 70, 200, 80, 'rare'),
  ('learning_7', '学霸', '学习属性达到70', '📚', 'learning', 'level', 70, 200, 80, 'rare'),
  ('career_7', '职场精英', '职业属性达到70', '💼', 'career', 'level', 70, 200, 80, 'rare'),
  ('social_7', '社交达人', '社交属性达到70', '❤️', 'social', 'level', 70, 200, 80, 'rare'),
  ('mental_7', '内心强大', '心理属性达到70', '🧘', 'mental', 'level', 70, 200, 80, 'rare'),
  ('habits_7', '自律王者', '习惯属性达到70', '🎯', 'habits', 'level', 70, 200, 80, 'rare'),
  ('creativity_7', '创意大师', '创造属性达到70', '🎨', 'creativity', 'level', 70, 200, 80, 'rare'),
  ('all_50', '全面发展', '所有属性达到50以上', '🌟', NULL, 'special', 50, 500, 200, 'epic'),
  ('all_70', '人生赢家', '所有属性达到70以上', '👑', NULL, 'special', 70, 1000, 500, 'legendary'),
  ('mood_7', '快乐一周', '连续7天情绪4分以上', '😊', 'mental', 'streak', 7, 150, 60, 'rare'),
  ('exercise_30', '运动达人', '累计运动30次', '🏃', 'health', 'total', 30, 300, 120, 'epic'),
  ('finance_save', '储蓄达人', '月储蓄率超过30%', '🏦', 'finance', 'special', 30, 200, 80, 'rare'),
  ('night_owl', '夜猫子', '连续3天凌晨1点后睡', '🦉', 'health', 'special', 3, 50, 20, 'common'),
  ('early_bird', '早起鸟', '连续7天7点前起床', '🐦', 'habits', 'streak', 7, 150, 60, 'rare');

-- ==========================================
-- 初始数据：商店物品
-- ==========================================

INSERT OR IGNORE INTO shop_items (id, name, description, icon, category, price, item_type, real_reward_desc) VALUES
  ('rest_half_day', '半天假期', '奖励自己休息半天', '🏖️', 'experience', 200, 'real_reward', '给自己放半天假，做想做的事'),
  ('movie_night', '电影之夜', '看一部想看的电影', '🎬', 'experience', 100, 'real_reward', '看一部收藏已久的电影'),
  ('nice_meal', '美食奖励', '吃一顿好的', '🍜', 'experience', 300, 'real_reward', '去吃一顿平时舍不得吃的大餐'),
  ('buy_book', '买本书', '买一本想看的书', '📖', 'reward', 150, 'real_reward', '购买一本想读的书'),
  ('game_time_2h', '游戏时间', '2小时无guilt游戏时间', '🎮', 'experience', 120, 'real_reward', '尽情玩2小时游戏'),
  ('sleep_in', '睡懒觉', '明天不设闹钟', '😴', 'experience', 80, 'real_reward', '明天睡到自然醒'),
  ('buy_gadget', '小物件', '买一个想买的小东西', '🎁', 'reward', 500, 'real_reward', '购买一个心愿清单上的小物件'),
  ('travel_day', '短途出游', '一天短途旅行', '✈️', 'experience', 800, 'real_reward', '来一次说走就走的短途旅行'),
  ('spa_day', 'spa放松', '做一次spa或按摩', '💆', 'experience', 400, 'real_reward', '去spa或按摩放松一下'),
  ('concert', '看演出', '看一场演唱会或话剧', '🎤', 'experience', 600, 'real_reward', '买票看一场演出'),
  ('new_clothes', '买新衣服', '买一件心仪的衣服', '👔', 'reward', 350, 'real_reward', '购买一件新衣服'),
  ('tech_upgrade', '数码升级', '升级一个数码配件', '📱', 'reward', 800, 'real_reward', '升级手机壳/耳机/键盘等'),
  ('theme_dark', '暗夜主题', '解锁暗夜主题', '🌙', 'cosmetic', 50, 'virtual', NULL),
  ('theme_sakura', '樱花主题', '解锁樱花主题', '🌸', 'cosmetic', 80, 'virtual', NULL),
  ('badge_fire', '🔥 烈焰徽章', '专属烈焰徽章', '🔥', 'cosmetic', 100, 'virtual', NULL),
  ('badge_star', '⭐ 星辰徽章', '专属星辰徽章', '⭐', 'cosmetic', 100, 'virtual', NULL),
  ('cat_food', '猫粮', '给猫猫侠买高级猫粮', '🐱', 'cosmetic', 50, 'virtual', '猫猫侠开心+10'),
  ('cat_toy', '猫玩具', '给猫猫侠买新玩具', '🧶', 'cosmetic', 80, 'virtual', '猫猫侠开心+20'),
  ('double_exp', '双倍经验卡', '24小时内任务经验翻倍', '⚡', 'boost', 200, 'virtual', '24小时双倍经验'),
  ('skip_task', '跳过卡', '跳过一个不想做的任务', '⏭️', 'boost', 50, 'virtual', '跳过一个任务');
