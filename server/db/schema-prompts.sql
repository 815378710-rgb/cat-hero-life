-- Prompt 配置表：支持运行时自定义提示词
CREATE TABLE IF NOT EXISTS prompt_configs (
    id TEXT PRIMARY KEY,
    template_name TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);
