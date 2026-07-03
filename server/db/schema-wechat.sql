-- 微信机器人相关表

-- 微信账号绑定
CREATE TABLE IF NOT EXISTS wechat_bindings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  wxid TEXT NOT NULL UNIQUE,
  bind_status TEXT DEFAULT 'active',
  bind_time TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 微信消息日志
CREATE TABLE IF NOT EXISTS wechat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  wxid TEXT,
  type TEXT NOT NULL, -- send/receive
  content TEXT,
  status TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_wechat_bindings_user ON wechat_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_wechat_bindings_wxid ON wechat_bindings(wxid);
CREATE INDEX IF NOT EXISTS idx_wechat_logs_user ON wechat_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_wechat_logs_created ON wechat_logs(created_at);
