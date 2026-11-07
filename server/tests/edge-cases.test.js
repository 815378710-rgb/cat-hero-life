// 猫猫侠 - 边界条件测试
// 运行: node --test server/tests/edge-cases.test.js

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb, createDbWrapper } from '../db/init.js';

describe('Edge Cases: Neural Engine', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should handle propagation with zero delta', async () => {
    const { propagate } = await import('../services/neural-engine.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const changes = propagate(db, userId, 'health', 0);
    assert.ok(changes.length === 0, 'zero delta should produce no changes');
  });

  it('should handle propagation with negative delta', async () => {
    const { propagate } = await import('../services/neural-engine.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const changes = propagate(db, userId, 'health', -10);
    assert.ok(changes.length > 0, 'negative delta should produce changes');
    assert.ok(changes[0].delta < 0, 'delta should be negative');
  });

  it('should clamp values to 0-100', async () => {
    const { propagate } = await import('../services/neural-engine.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    // Set health to 95, then propagate +20
    db.prepare('UPDATE users SET stat_health = 95 WHERE id = ?').run(userId);
    const changes = propagate(db, userId, 'health', 20);
    const health = db.prepare('SELECT stat_health FROM users WHERE id = ?').get(userId);
    assert.ok(health.stat_health <= 100, 'should clamp to 100');
    assert.ok(health.stat_health >= 0, 'should clamp to 0');
  });

  it('should not propagate to self', async () => {
    const { propagate } = await import('../services/neural-engine.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    db.prepare('UPDATE users SET stat_health = 50 WHERE id = ?').run(userId);
    const changes = propagate(db, userId, 'health', 5);
    const selfRef = changes.find(c => c.dim === 'health' && c.depth > 0);
    assert.ok(!selfRef, 'should not propagate back to source');
  });
});

describe('Edge Cases: Energy Model', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should handle all dimensions at 0', async () => {
    const { calculateCurrentEnergy } = await import('../services/energy-model.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    db.prepare('UPDATE users SET stat_health=0, stat_finance=0, stat_learning=0, stat_career=0, stat_social=0, stat_mental=0, stat_habits=0, stat_creativity=0 WHERE id = ?').run(userId);
    const energy = calculateCurrentEnergy(db, userId);
    assert.ok(energy >= 0, 'energy should not be negative');
    assert.ok(energy <= 100, 'energy should not exceed 100');
  });

  it('should handle all dimensions at 100', async () => {
    const { calculateCurrentEnergy } = await import('../services/energy-model.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    db.prepare('UPDATE users SET stat_health=100, stat_finance=100, stat_learning=100, stat_career=100, stat_social=100, stat_mental=100, stat_habits=100, stat_creativity=100 WHERE id = ?').run(userId);
    const energy = calculateCurrentEnergy(db, userId);
    assert.ok(energy >= 0 && energy <= 100);
  });
});

describe('Edge Cases: Balance Radar', async () => {
  it('should handle extreme values', async () => {
    const { classifyShape } = await import('../services/balance-radar.js');
    // All zeros
    const zeros = classifyShape({ health: 0, finance: 0, learning: 0, career: 0, social: 0, mental: 0, habits: 0, creativity: 0 });
    assert.ok(zeros, 'should handle all zeros');

    // All 100
    const maxs = classifyShape({ health: 100, finance: 100, learning: 100, career: 100, social: 100, mental: 100, habits: 100, creativity: 100 });
    assert.ok(maxs, 'should handle all 100s');
  });

  it('should calculate balance score correctly', async () => {
    const { calculateBalanceScore } = await import('../services/balance-radar.js');
    // Perfect balance
    const perfect = calculateBalanceScore({ health: 50, finance: 50, learning: 50, career: 50, social: 50, mental: 50, habits: 50, creativity: 50 });
    assert.ok(perfect > 90, 'equal values should be high balance');

    // Extreme imbalance
    const imbalanced = calculateBalanceScore({ health: 100, finance: 0, learning: 0, career: 0, social: 0, mental: 0, habits: 0, creativity: 0 });
    assert.ok(imbalanced < 50, 'extreme values should be low balance');
  });
});

describe('Edge Cases: Memory System', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should handle empty query', async () => {
    const { retrieveMemories } = await import('../services/memory-system.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const results = retrieveMemories(db, userId, '');
    assert.ok(Array.isArray(results));
  });

  it('should handle very long content', async () => {
    const { addMemory, retrieveMemories } = await import('../services/memory-system.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const longContent = '测试'.repeat(1000);
    const id = addMemory(db, userId, 'working', 'conversation', '长内容测试', longContent, '摘要', 5, 'test');
    assert.ok(id, 'should handle long content');
  });

  it('should handle special characters in search', async () => {
    const { retrieveMemories } = await import('../services/memory-system.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const results = retrieveMemories(db, userId, "test%_'");
    assert.ok(Array.isArray(results));
  });
});

describe('Edge Cases: Social Graph', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should handle duplicate person names', async () => {
    const { upsertSocialPerson } = await import('../services/social-graph.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const id1 = upsertSocialPerson(db, userId, '小明', 'friend');
    const id2 = upsertSocialPerson(db, userId, '小明', 'friend');
    assert.equal(id1, id2, 'same name should return same id');
  });

  it('should handle message without social context', async () => {
    const { extractSocialFromMessage } = await import('../services/social-graph.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const result = extractSocialFromMessage(db, userId, '今天天气不错');
    assert.equal(result, null, 'no social context should return null');
  });
});

describe('Edge Cases: Decision Tracker', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should handle empty decision text', async () => {
    const { recordDecision } = await import('../services/decision-tracker.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const id = recordDecision(db, userId, '', 'health');
    assert.ok(id, 'should handle empty text');
  });

  it('should handle very long decision text', async () => {
    const { recordDecision } = await import('../services/decision-tracker.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const longText = '这是一个很长的决定'.repeat(50);
    const id = recordDecision(db, userId, longText, 'health');
    assert.ok(id, 'should handle long text');
  });
});

describe('Edge Cases: Personality Mask', async () => {
  let db;
  before(async () => { await initDb(); db = createDbWrapper(getDb()); });

  it('should handle empty context tags', async () => {
    const { selectStyle } = await import('../services/personality-mask.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const style = selectStyle(db, userId, []);
    assert.ok(['encouraging', 'strict', 'funny'].includes(style));
  });

  it('should handle unknown emotion', async () => {
    const { buildContextTag } = await import('../services/personality-mask.js');
    const tag = buildContextTag('unknown', 'unknown', 'unknown', 'unknown');
    assert.equal(tag, 'unknown:unknown:unknown:unknown');
  });
});

describe('Edge Cases: Data Quality', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should handle null values', async () => {
    const { recordExtractedData } = await import('../services/data-quality.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const id = recordExtractedData(db, userId, 'chat', 'health', null, null, 0);
    assert.ok(id, 'should handle null values');
  });

  it('should detect conflicts with same value', async () => {
    const { detectConflicts, recordExtractedData } = await import('../services/data-quality.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    recordExtractedData(db, userId, 'chat', 'weight', '体重70kg', { value: 70 }, 0.8);
    const conflict = detectConflicts(db, userId, 70, 'weight');
    // Same value should not be a conflict
    assert.ok(conflict === null || conflict.type);
  });
});

describe('Edge Cases: Habit Stacking', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should handle no habits', async () => {
    const { findAnchorHabits } = await import('../services/habit-stacking.js');
    // Delete all habits first
    db.prepare('DELETE FROM habit_logs').run();
    db.prepare('DELETE FROM habits').run();
    const anchors = findAnchorHabits(db, db.prepare('SELECT id FROM users LIMIT 1').get().id);
    assert.equal(anchors.length, 0, 'no habits should return empty');
  });
});

describe('Edge Cases: Gamification', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should handle level 0', async () => {
    const { getCurrentCatForm, getNextCatForm } = await import('../services/gamification-deep.js');
    const form = getCurrentCatForm(db, 0);
    assert.ok(form, 'should return default form for level 0');
  });

  it('should handle very high level', async () => {
    const { initCatEvolutions, getCurrentCatForm, getNextCatForm } = await import('../services/gamification-deep.js');
    initCatEvolutions(db);
    const form = getCurrentCatForm(db, 999);
    assert.ok(form, 'should return max form for level 999');
    const next = getNextCatForm(db, 999);
    assert.ok(!next, 'should have no next form at max level');
  });
});

describe('Edge Cases: Smart Notifications', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should handle urgent priority at any time', async () => {
    const { shouldNotify } = await import('../services/smart-notifications.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const result = shouldNotify(db, userId, 'urgent');
    assert.equal(result.should, true, 'urgent should always notify');
  });

  it('should handle empty notification log', async () => {
    const { getNotificationStats } = await import('../services/smart-notifications.js');
    db.prepare('DELETE FROM notification_log').run();
    const stats = getNotificationStats(db, db.prepare('SELECT id FROM users LIMIT 1').get().id);
    assert.equal(stats.total, 0);
  });
});

describe('Edge Cases: Lifecycle', async () => {
  it('should handle null profile', async () => {
    const { detectLifeStage, getStageTone, getStageTaskTemplates } = await import('../services/lifecycle.js');
    assert.equal(detectLifeStage(null), null);
    assert.equal(detectLifeStage({}), null);
    assert.ok(getStageTone(null));
    assert.ok(getStageTaskTemplates(null));
  });

  it('should handle edge ages', async () => {
    const { detectLifeStage } = await import('../services/lifecycle.js');
    const currentYear = new Date().getFullYear();
    const young = detectLifeStage({ birth_year: currentYear - 1 });
    assert.ok(young, 'should handle very young age');
    const old = detectLifeStage({ birth_year: 1900 });
    assert.equal(old.stage, 'wisdom');
  });
});

describe('Edge Cases: Dialogue Engine', async () => {
  it('should handle empty message', async () => {
    const { shouldFollowUp } = await import('../services/dialogue-engine.js');
    const result = shouldFollowUp('', { emotion: null, intent: 'general' }, []);
    assert.ok('should' in result);
  });

  it('should handle very long message', async () => {
    const { shouldFollowUp } = await import('../services/dialogue-engine.js');
    const longMsg = '这是一段很长的消息'.repeat(100);
    const result = shouldFollowUp(longMsg, { emotion: 'sad', intent: 'general' }, []);
    assert.ok('should' in result);
  });
});
