-- ==========================================
-- 猫猫侠 神经智能系统 Schema
-- ==========================================

-- 1. 维度影响力矩阵 (神经网络权重)
CREATE TABLE IF NOT EXISTS dimension_influence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_dim TEXT NOT NULL,
  target_dim TEXT NOT NULL,
  weight REAL DEFAULT 0.0,
  learned_from TEXT DEFAULT 'default',  -- default/model/manual
  sample_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(source_dim, target_dim)
);

-- 2. 属性传播日志
CREATE TABLE IF NOT EXISTS propagation_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  trigger_dim TEXT NOT NULL,
  trigger_delta REAL NOT NULL,
  steps TEXT,              -- JSON: [{dim, delta, depth, source}]
  total_affected INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 3. 能量基线档案
CREATE TABLE IF NOT EXISTS energy_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,  -- 0-6
  hour INTEGER NOT NULL,         -- 0-23
  baseline_energy REAL DEFAULT 50,
  sample_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, day_of_week, hour),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 4. 能量日志
CREATE TABLE IF NOT EXISTS energy_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  log_date DATE NOT NULL,
  hour INTEGER NOT NULL,
  energy REAL NOT NULL,
  source TEXT DEFAULT 'inferred',  -- inferred/self_report/checkin
  context TEXT,                    -- JSON
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 5. 决策事件
CREATE TABLE IF NOT EXISTS decision_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_source TEXT NOT NULL,      -- story_event/user_stated/ai_suggested
  decision_text TEXT NOT NULL,
  dimension_affected TEXT,
  context TEXT,                    -- JSON: 当时快照
  decided_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 6. 决策结果追踪
CREATE TABLE IF NOT EXISTS decision_outcomes (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  check_type TEXT NOT NULL,        -- 3d/7d/30d
  checked_at TEXT DEFAULT (datetime('now')),
  dim_before TEXT,                 -- JSON
  dim_after TEXT,                  -- JSON
  delta TEXT,                      -- JSON
  verdict TEXT,                    -- positive/negative/neutral
  narrative TEXT,
  FOREIGN KEY (decision_id) REFERENCES decision_events(id)
);

-- 7. 人生平衡快照
CREATE TABLE IF NOT EXISTS balance_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  dim_values TEXT NOT NULL,        -- JSON
  shape_type TEXT,
  balance_score REAL,
  narrative TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 8. 习惯嫁接
CREATE TABLE IF NOT EXISTS habit_stacking (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  new_habit_id TEXT NOT NULL,
  anchor_habit_id TEXT NOT NULL,
  anchor_moment TEXT DEFAULT 'after',  -- before/after/during
  cue_description TEXT,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',        -- active/graduated/abandoned
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (new_habit_id) REFERENCES habits(id),
  FOREIGN KEY (anchor_habit_id) REFERENCES habits(id)
);

-- 9. 人格动态
CREATE TABLE IF NOT EXISTS personality_dynamics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  context TEXT NOT NULL,           -- 情境标签
  style TEXT NOT NULL,             -- encouraging/strict/funny
  effectiveness REAL DEFAULT 0.0,
  sample_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, context, style),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 10. 互动日志 (人格系统用)
CREATE TABLE IF NOT EXISTS interaction_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ai_style_used TEXT,
  context_tags TEXT,               -- JSON
  user_reaction TEXT,              -- engaged/ignored/negative/positive
  emotion_before INTEGER,
  emotion_after INTEGER,
  energy_change INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 11. 社交关系图
CREATE TABLE IF NOT EXISTS social_graph (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  person_name TEXT NOT NULL,
  relationship TEXT DEFAULT 'other',  -- friend/family/colleague/partner/mentor/other
  closeness REAL DEFAULT 50,
  influence_score REAL DEFAULT 0,     -- -100 to 100
  last_contact DATE,
  contact_frequency REAL DEFAULT 7,   -- 平均联系频率(天)
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 12. 社交互动记录
CREATE TABLE IF NOT EXISTS social_interactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  interaction_type TEXT,           -- chat/call/meet/online
  duration_minutes INTEGER,
  emotion_before INTEGER,
  emotion_after INTEGER,
  energy_change INTEGER DEFAULT 0,
  context TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (person_id) REFERENCES social_graph(id)
);

-- 13. 三层记忆系统
CREATE TABLE IF NOT EXISTS memory_system (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  memory_layer TEXT NOT NULL,      -- working/short_term/long_term
  memory_type TEXT NOT NULL,       -- event/emotion/decision/pattern/insight
  title TEXT NOT NULL,
  content TEXT,
  summary TEXT,
  embedding TEXT,                  -- JSON: 向量数据(预留)
  importance REAL DEFAULT 5,
  access_count INTEGER DEFAULT 0,
  last_accessed TEXT,
  decay_rate REAL DEFAULT 0.1,
  related_memories TEXT,           -- JSON: 关联记忆id列表
  tags TEXT,                       -- JSON: 标签
  source TEXT,                     -- chat/checkin/event/system
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 14. 通知活跃模式
CREATE TABLE IF NOT EXISTS notification_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  hour INTEGER NOT NULL,
  day_of_week INTEGER,
  open_rate REAL DEFAULT 0,
  response_rate REAL DEFAULT 0,
  sample_count INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, hour, day_of_week),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 15. 通知记录与反馈
CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  notification_type TEXT,
  priority TEXT DEFAULT 'normal',  -- urgent/important/normal/low
  content TEXT,
  sent_at TEXT DEFAULT (datetime('now')),
  opened_at TEXT,
  responded_at TEXT,
  dismissed_at TEXT,
  channel TEXT,                    -- system/wechat/feishu
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 16. 主线剧情
CREATE TABLE IF NOT EXISTS story_arcs (
  id TEXT PRIMARY KEY,
  arc_name TEXT NOT NULL,
  arc_type TEXT,                   -- main/side/daily
  chapter INTEGER DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT,
  unlock_condition TEXT,           -- JSON
  reward_text TEXT,
  status TEXT DEFAULT 'locked',    -- locked/active/completed
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 17. 用户剧情进度
CREATE TABLE IF NOT EXISTS user_story_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  arc_id TEXT NOT NULL,
  status TEXT DEFAULT 'active',    -- active/completed/abandoned
  progress INTEGER DEFAULT 0,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (arc_id) REFERENCES story_arcs(id)
);

-- 18. 任务链
CREATE TABLE IF NOT EXISTS quest_chains (
  id TEXT PRIMARY KEY,
  chain_name TEXT NOT NULL,
  dimension_id TEXT,
  description TEXT,
  total_steps INTEGER DEFAULT 1,
  rewards TEXT,                    -- JSON
  unlock_level INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 19. 任务链步骤
CREATE TABLE IF NOT EXISTS quest_steps (
  id TEXT PRIMARY KEY,
  chain_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT,                  -- checkin/attribute/streak/special
  target_value REAL,
  exp_reward INTEGER DEFAULT 10,
  coin_reward INTEGER DEFAULT 5,
  bonus_text TEXT,
  FOREIGN KEY (chain_id) REFERENCES quest_chains(id)
);

-- 20. 用户任务链进度
CREATE TABLE IF NOT EXISTS user_quest_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  chain_id TEXT NOT NULL,
  current_step INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',    -- active/completed/abandoned
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (chain_id) REFERENCES quest_chains(id)
);

-- 21. 称号系统
CREATE TABLE IF NOT EXISTS titles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  condition_type TEXT NOT NULL,
  condition_value TEXT,            -- JSON
  rarity TEXT DEFAULT 'common',
  created_at TEXT DEFAULT (datetime('now'))
);

-- 22. 用户称号
CREATE TABLE IF NOT EXISTS user_titles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  unlocked_at TEXT DEFAULT (datetime('now')),
  is_active INTEGER DEFAULT 0,    -- 是否当前佩戴
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (title_id) REFERENCES titles(id),
  UNIQUE(user_id, title_id)
);

-- 23. 猫猫侠进化形态
CREATE TABLE IF NOT EXISTS cat_evolution (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level_required INTEGER NOT NULL,
  form_name TEXT NOT NULL,
  form_emoji TEXT NOT NULL,
  description TEXT,
  abilities TEXT,                  -- JSON: 解锁的能力
  UNIQUE(level_required)
);

-- 24. 数据可信度
CREATE TABLE IF NOT EXISTS data_confidence (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL,       -- chat/checkin/manual/inferred
  data_type TEXT NOT NULL,         -- health/finance/mood/etc
  confidence REAL DEFAULT 0.5,
  raw_text TEXT,
  extracted_value TEXT,            -- JSON
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 25. 用户活跃模式
CREATE TABLE IF NOT EXISTS user_activity_pattern (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,
  hour INTEGER NOT NULL,
  activity_count INTEGER DEFAULT 0,
  avg_session_minutes REAL DEFAULT 0,
  last_active TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, day_of_week, hour),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
