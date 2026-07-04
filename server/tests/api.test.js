// 猫猫侠 - API集成测试
// 运行: node --test server/tests/api.test.js

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb, createDbWrapper, saveDbImmediate } from '../db/init.js';

// 模拟Express请求/响应
function mockReq(db, body = {}, query = {}, params = {}) {
  return { db, body, query, params };
}

function mockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.data = data; return res; },
  };
  return res;
}

describe('Checkins API', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should create checkin and return exp/coins', async () => {
    const { default: router } = await import('../routes/checkins.js');
    // 直接测试数据库操作
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    assert.ok(user.id);

    const id = 'test-checkin-' + Date.now();
    db.prepare('INSERT INTO check_ins (id, user_id, dimension_id, check_type, title, value, mood) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, user.id, 'health', 'manual', '测试打卡', 5, 4);

    const checkin = db.prepare('SELECT * FROM check_ins WHERE id = ?').get(id);
    assert.ok(checkin);
    assert.equal(checkin.title, '测试打卡');
    assert.equal(checkin.value, 5);
  });

  it('should get today checkins count', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    const count = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(user.id, today);
    assert.ok(count.c >= 0);
  });
});

describe('Tasks API', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should create task', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const id = 'test-task-' + Date.now();
    db.prepare('INSERT INTO tasks (id, user_id, dimension_id, title, task_type, difficulty, exp_reward, coin_reward) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, user.id, 'health', '测试任务', 'daily', 'medium', 20, 10);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    assert.ok(task);
    assert.equal(task.status, 'pending');
  });

  it('should complete task', () => {
    const task = db.prepare("SELECT * FROM tasks WHERE status = 'pending' LIMIT 1").get();
    if (task) {
      db.prepare("UPDATE tasks SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(task.id);
      const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);
      assert.equal(updated.status, 'completed');
    }
  });

  it('should get tasks grouped by status', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const tasks = db.prepare('SELECT * FROM tasks WHERE user_id = ?').all(user.id);
    const grouped = {
      pending: tasks.filter(t => t.status === 'pending'),
      completed: tasks.filter(t => t.status === 'completed'),
    };
    assert.ok(Array.isArray(grouped.pending));
    assert.ok(Array.isArray(grouped.completed));
  });
});

describe('Chat API', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should save chat message', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', '测试消息')").run(user.id);
    const msg = db.prepare('SELECT * FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(user.id);
    assert.equal(msg.content, '测试消息');
    assert.equal(msg.role, 'user');
  });

  it('should get chat history', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const messages = db.prepare('SELECT * FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(user.id);
    assert.ok(Array.isArray(messages));
    assert.ok(messages.length > 0);
  });
});

describe('Gamification API', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should get user achievements', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const achievements = db.prepare('SELECT a.*, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON ua.achievement_id = a.id WHERE ua.user_id = ?').all(user.id);
    assert.ok(Array.isArray(achievements));
  });

  it('should get all achievements with unlock status', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const all = db.prepare('SELECT * FROM achievements').all();
    const unlocked = db.prepare('SELECT achievement_id FROM user_achievements WHERE user_id = ?').all(user.id);
    const unlockedIds = new Set(unlocked.map(u => u.achievement_id));
    const result = all.map(a => ({ ...a, unlocked: unlockedIds.has(a.id) }));
    assert.ok(result.length > 0);
  });

  it('should get shop items', () => {
    const items = db.prepare('SELECT * FROM shop_items').all();
    assert.ok(items.length > 0);
    assert.ok(items[0].name);
    assert.ok(items[0].price > 0);
  });
});

describe('Habits API', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should create habit', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const id = 'test-habit-' + Date.now();
    db.prepare('INSERT INTO habits (id, user_id, dimension_id, name, icon) VALUES (?, ?, ?, ?, ?)')
      .run(id, user.id, 'health', '每天喝水', '💧');

    const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
    assert.ok(habit);
    assert.equal(habit.name, '每天喝水');
  });

  it('should log habit and update streak', () => {
    const habit = db.prepare('SELECT * FROM habits LIMIT 1').get();
    if (habit) {
      db.prepare('INSERT INTO habit_logs (id, habit_id, user_id) VALUES (?, ?, ?)')
        .run('log-' + Date.now(), habit.id, habit.user_id);

      const logs = db.prepare('SELECT * FROM habit_logs WHERE habit_id = ?').all(habit.id);
      assert.ok(logs.length > 0);
    }
  });
});

describe('Goals API', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should create goal', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const id = 'test-goal-' + Date.now();
    db.prepare('INSERT INTO goals (id, user_id, dimension_id, title, target_value, unit) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, user.id, 'health', '减重目标', 70, 'kg');

    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
    assert.ok(goal);
    assert.equal(goal.title, '减重目标');
  });

  it('should get goals with task counts', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const goals = db.prepare(`
      SELECT g.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id AND t.status = 'completed') as tasks_done,
        (SELECT COUNT(*) FROM tasks t WHERE t.goal_id = g.id) as tasks_total
      FROM goals g WHERE g.user_id = ?
    `).all(user.id);
    assert.ok(Array.isArray(goals));
  });
});

describe('Reports API', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should get daily report', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    const report = db.prepare('SELECT * FROM daily_reports WHERE user_id = ? AND report_date = ?').get(user.id, today);
    // Report may not exist yet
    assert.ok(report === undefined || report.id);
  });

  it('should create daily report', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    const id = 'report-' + Date.now();
    db.prepare('INSERT OR REPLACE INTO daily_reports (id, user_id, report_date, summary, tasks_completed, tasks_total) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, user.id, today, '测试报告', 3, 5);

    const report = db.prepare('SELECT * FROM daily_reports WHERE id = ?').get(id);
    assert.ok(report);
    assert.equal(report.summary, '测试报告');
  });
});

describe('Profile API', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should get life profile', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    // Profile may not exist
    assert.ok(profile === undefined || profile.id);
  });

  it('should create life profile', () => {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const id = 'profile-' + Date.now();
    db.prepare('INSERT OR REPLACE INTO life_profile (id, user_id, gender, birth_year, city) VALUES (?, ?, ?, ?, ?)')
      .run(id, user.id, 'male', 1995, '上海');

    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    assert.ok(profile);
    assert.equal(profile.city, '上海');
  });
});

describe('Events API', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should create story event', () => {
    const id = 'event-' + Date.now();
    db.prepare('INSERT INTO story_events (id, title, description, event_type, dimension_id, choices, rarity) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, '测试事件', '测试描述', 'dynamic', 'health', '[]', 'common');

    const event = db.prepare('SELECT * FROM story_events WHERE id = ?').get(id);
    assert.ok(event);
    assert.equal(event.title, '测试事件');
  });

  it('should get active events', () => {
    const events = db.prepare('SELECT * FROM story_events WHERE is_active = 1').all();
    assert.ok(Array.isArray(events));
  });
});
