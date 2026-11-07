// autoSaveProfile 档案提取 - 集成测试
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { v4 as uid } from 'uuid';

// Import the function under test
import { autoSaveProfile } from '../routes/wechat-bot.js';

let db;

function setupTestDb() {
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create minimal schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT, personality_type TEXT DEFAULT 'encouraging',
      level INTEGER DEFAULT 1, exp INTEGER DEFAULT 0, coins INTEGER DEFAULT 0,
      consecutive_sign_days INTEGER DEFAULT 0, last_sign_date TEXT,
      stat_health INTEGER DEFAULT 0, stat_learning INTEGER DEFAULT 0,
      stat_career INTEGER DEFAULT 0, stat_finance INTEGER DEFAULT 0,
      stat_social INTEGER DEFAULT 0, stat_mental INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS life_profile (
      id TEXT PRIMARY KEY, user_id TEXT,
      birth_year INTEGER, height_cm INTEGER, weight_kg INTEGER,
      current_job TEXT, annual_income_range TEXT, city TEXT,
      onboarding_completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY, user_id TEXT, dimension_id TEXT,
      title TEXT, description TEXT, target_value REAL, unit TEXT,
      deadline TEXT, priority TEXT DEFAULT 'medium',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS life_dimensions (
      id TEXT PRIMARY KEY, name TEXT
    );
  `);

  // Create test user
  const userId = uid();
  db.prepare("INSERT INTO users (id, username) VALUES (?, '老大')").run(userId);

  // Create dimension entries for goal extraction
  db.prepare("INSERT INTO life_dimensions (id, name) VALUES (?, '财务')").run(uid());
  db.prepare("INSERT INTO life_dimensions (id, name) VALUES (?, '事业')").run(uid());
  db.prepare("INSERT INTO life_dimensions (id, name) VALUES (?, '学习')").run(uid());
  db.prepare("INSERT INTO life_dimensions (id, name) VALUES (?, '健康')").run(uid());

  return userId;
}

beforeEach(() => {
  if (db) db.close();
});

afterAll(() => {
  if (db) db.close();
});

describe('autoSaveProfile - basic extraction', () => {
  it('extracts birth year from 年月日 format', () => {
    const userId = setupTestDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    
    const history = [
      { content: '我叫寇豆码' },
      { content: '我是01年10月2日生的' },
    ];

    autoSaveProfile(db, userId, history, user);

    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
    expect(profile).toBeTruthy();
    expect(profile.birth_year).toBe(2001);
  });

  it('extracts birth year from age format', () => {
    const userId = setupTestDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    
    const history = [{ content: '我今年25岁' }];
    
    autoSaveProfile(db, userId, history, user);

    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
    expect(profile.birth_year).toBe(new Date().getFullYear() - 25);
  });

  it('extracts height and weight', () => {
    const userId = setupTestDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    
    const history = [
      { content: '我身高180，体重166斤' },
    ];
    
    autoSaveProfile(db, userId, history, user);

    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
    expect(profile.height_cm).toBe(180);
    expect(profile.weight_kg).toBe(166);
  });

  it('extracts profession', () => {
    const userId = setupTestDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    
    const history = [{ content: '我是做小红书运营的' }];
    
    autoSaveProfile(db, userId, history, user);

    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
    expect(profile.current_job).toBe('小红书运营');
  });

  it('extracts income from monthly salary context', () => {
    const userId = setupTestDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    
    const history = [
      { content: '我月收入9.5k，兼职有1.5k' },
    ];
    
    autoSaveProfile(db, userId, history, user);

    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
    expect(profile.annual_income_range).toBeTruthy();
    // 9.5k + 1.5k = 11k * 12 = 13.2万 ≈ "13万"
    expect(profile.annual_income_range).toMatch(/^\d+万$/);
  });

  it('does NOT count savings/asset goals as income', () => {
    const userId = setupTestDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    
    // "存100w" should NOT be added to income
    const history = [
      { content: '月收入9.5k，存100w是我的目标' },
    ];
    
    autoSaveProfile(db, userId, history, user);

    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
    // Only the income context (月收入...) should be counted
    // 9.5k = 9500 * 12 = 114000 ≈ "11万"
    const income = parseInt(profile.annual_income_range);
    expect(income).toBeLessThan(20); // Not 100+万 from 存100w
  });

  it('extracts city', () => {
    const userId = setupTestDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    
    const history = [{ content: '我现在在西安' }];
    
    autoSaveProfile(db, userId, history, user);

    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
    expect(profile.city).toBe('西安');
  });
});

describe('autoSaveProfile - onboarding completion', () => {
  it('sets onboarding_completed when birth_year and job are both present', () => {
    const userId = setupTestDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    
    const history = [
      { content: '我01年生的，在西安做小红书运营' },
    ];
    
    autoSaveProfile(db, userId, history, user);

    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
    expect(profile.birth_year).toBe(2001);
    expect(profile.current_job).toBe('小红书运营');
    expect(profile.onboarding_completed).toBe(1);
  });
});

describe('autoExtractGoals', () => {
  it('extracts financial goals from conversation', () => {
    const userId = setupTestDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    
    const history = [
      { content: '我今年的目标是存100万，再买1套房' },
    ];
    
    autoSaveProfile(db, userId, history, user);

    const goals = db.prepare('SELECT title FROM goals WHERE user_id = ?').all(userId);
    const titles = goals.map(g => g.title);
    
    // Should have extracted at least "存100万" goal
    const hasSavingsGoal = titles.some(t => t.includes('存') && t.includes('100'));
    expect(hasSavingsGoal).toBe(true);
  });

  it('does not duplicate goals on re-extraction', () => {
    const userId = setupTestDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    
    const history = [{ content: '我今年要存100万' }];
    
    // First extraction
    autoSaveProfile(db, userId, history, user);
    const count1 = db.prepare('SELECT COUNT(*) as c FROM goals WHERE user_id = ?').get(userId).c;
    
    // Second extraction with same content
    autoSaveProfile(db, userId, history, user);
    const count2 = db.prepare('SELECT COUNT(*) as c FROM goals WHERE user_id = ?').get(userId).c;
    
    expect(count2).toBe(count1);
  });
});
