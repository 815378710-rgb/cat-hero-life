-- 猫猫侠 · 彩票板块（大乐透 / 双色球）
-- 一条记录 = 一注彩票

CREATE TABLE IF NOT EXISTS lottery_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  game TEXT NOT NULL,
  issue TEXT,
  bet_date TEXT,
  draw_date TEXT,
  numbers TEXT NOT NULL,
  multiple INTEGER DEFAULT 1,
  is_append INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  image TEXT,
  status TEXT DEFAULT 'pending',
  prize_level INTEGER DEFAULT 0,
  hit_detail TEXT,
  prize REAL DEFAULT 0,
  checked_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lottery_tickets_user ON lottery_tickets(user_id, status);

CREATE INDEX IF NOT EXISTS idx_lottery_tickets_issue ON lottery_tickets(game, issue);

CREATE TABLE IF NOT EXISTS lottery_draws (
  game TEXT NOT NULL,
  issue TEXT NOT NULL,
  draw_date TEXT NOT NULL,
  numbers TEXT NOT NULL,
  prize_levels TEXT,
  pool TEXT,
  sales TEXT,
  updated_at TEXT,
  PRIMARY KEY (game, issue)
);

CREATE INDEX IF NOT EXISTS idx_lottery_draws_date ON lottery_draws(game, draw_date);

CREATE TABLE IF NOT EXISTS lottery_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  ticket_id INTEGER,
  game TEXT,
  issue TEXT,
  kind TEXT,
  content TEXT,
  created_at TEXT NOT NULL
);
