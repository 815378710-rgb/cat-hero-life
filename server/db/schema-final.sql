-- 扩展Schema - 新功能表

-- 情绪日志
CREATE TABLE IF NOT EXISTS emotion_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  log_date TEXT NOT NULL,
  mood_score INTEGER,      -- 1-5
  mood_text TEXT,           -- positive/neutral/negative/tired
  energy INTEGER,           -- 1-5
  note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, log_date)
);

-- 推送订阅
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  subscription_json TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 猫猫侠成长记录
CREATE TABLE IF NOT EXISTS cat_growth (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  cat_level INTEGER DEFAULT 1,
  cat_exp INTEGER DEFAULT 0,
  cat_mood TEXT DEFAULT 'happy',    -- happy/neutral/sad/excited/tired
  cat_personality TEXT DEFAULT 'encouraging',
  unlocked_abilities TEXT,           -- JSON
  total_interactions INTEGER DEFAULT 0,
  total_days_together INTEGER DEFAULT 0,
  first_meet_date TEXT,
  last_interaction TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 周/月规划
CREATE TABLE IF NOT EXISTS periodic_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_type TEXT NOT NULL,   -- weekly/monthly
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  goals TEXT,                -- JSON: 本周/月目标
  tasks_generated INTEGER DEFAULT 0,
  review TEXT,               -- 复盘总结
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 天气缓存
CREATE TABLE IF NOT EXISTS weather_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT,
  weather_data TEXT,         -- JSON
  cached_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT DEFAULT (datetime('now')));
