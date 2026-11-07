// 数据库初始化 + 关键操作 - 集成测试
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync, unlinkSync, rmdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(__dirname, '..', 'db');
const TEST_DB_PATH = join(__dirname, '..', '..', 'data', 'test-cat-hero.db');

let db;

function loadSchema(db, sqlFile) {
  const schemaPath = join(SCHEMA_DIR, sqlFile);
  if (!existsSync(schemaPath)) return;
  
  const schema = readFileSync(schemaPath, 'utf-8');
  const statements = schema
    .split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
    .split(/;\s*\n/).map(s => s.trim()).filter(s => s.length > 5);
  
  for (const stmt of statements) {
    try { db.exec(stmt + ';'); }
    catch (e) {
      if (!e.message.includes('already exists') &&
          !e.message.includes('UNIQUE')) throw e;
    }
  }
}

beforeAll(() => {
  const dataDir = join(__dirname, '..', '..', 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  
  // Use in-memory DB for tests
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
});

afterAll(() => {
  if (db) db.close();
  try { unlinkSync(TEST_DB_PATH); } catch {}
});

describe('Database Schema', () => {
  it('loads core schema without errors', () => {
    loadSchema(db, 'schema.sql');
    
    // Verify core tables exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);
    
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('tasks');
    expect(tableNames).toContain('check_ins');
    expect(tableNames).toContain('habits');
    expect(tableNames).toContain('chat_history');
  });

  it('creates default user', () => {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    if (!user) {
      const { v4: uuid } = require('uuid');
      db.prepare("INSERT INTO users (id, username, personality_type) VALUES (?, '主人', 'encouraging')")
        .run(uuid());
    }
    
    const user2 = db.prepare('SELECT * FROM users LIMIT 1').get();
    expect(user2).toBeTruthy();
    expect(user2.username).toBe('主人');
    expect(user2.personality_type).toBe('encouraging');
  });

  it('loads wechat schema', () => {
    loadSchema(db, 'schema-wechat.sql');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('wechat_bindings');
    expect(tableNames).toContain('wechat_logs');
  });

  it('loads neural schema', () => {
    loadSchema(db, 'schema-neural.sql');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);
    // Neural tables should exist
    const neuralTables = tableNames.filter(t => t.includes('neural') || t.includes('emotion'));
    expect(neuralTables.length).toBeGreaterThan(0);
  });
});

describe('Database CRUD', () => {
  beforeAll(() => {
    // Load minimal schema for CRUD tests
    loadSchema(db, 'schema.sql');
    
    // Ensure a user exists
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (!user) {
      db.prepare("INSERT INTO users (id, username, personality_type) VALUES ('test-user-1', 'test', 'encouraging')").run();
    }
  });

  it('inserts and reads chat history', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', ?)")
      .run(user.id, '测试消息1');
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'assistant', ?)")
      .run(user.id, '测试回复1');
    
    const history = db.prepare('SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10')
      .all(user.id);
    
    expect(history.length).toBe(2);
    expect(history[1].role).toBe('user');
    expect(history[1].content).toBe('测试消息1');
    expect(history[0].role).toBe('assistant');
  });

  it('upserts life_profile', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    
    // Check if table exists first
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='life_profile'").all();
    if (tables.length === 0) {
      db.exec(`CREATE TABLE IF NOT EXISTS life_profile (
        id TEXT PRIMARY KEY, user_id TEXT, birth_year INTEGER,
        height_cm INTEGER, weight_kg INTEGER, current_job TEXT,
        annual_income_range TEXT, city TEXT, onboarding_completed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
    }
    
    db.prepare("INSERT OR REPLACE INTO life_profile (id, user_id, birth_year, current_job) VALUES ('lp-1', ?, 2001, '小红书运营')")
      .run(user.id);
    
    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    expect(profile.birth_year).toBe(2001);
    expect(profile.current_job).toBe('小红书运营');
  });
});

describe('Chat History Limits', () => {
  it('respects LIMIT on queries', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    
    // Insert 20 messages
    for (let i = 0; i < 20; i++) {
      db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', ?)")
        .run(user.id, `消息 ${i}`);
    }
    
    // Query last 12
    const history = db.prepare('SELECT content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 12')
      .all(user.id);
    
    expect(history.length).toBe(12);
    // Should be the 12 most recent (highest indices)
    expect(history[0].content).toBe('消息 19');
    expect(history[11].content).toBe('消息 8');
  });
});
