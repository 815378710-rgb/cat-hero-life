// 猫猫侠 - 核心服务单元测试
// 运行: node --test server/tests/services.test.js

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb, createDbWrapper, saveDbImmediate } from '../db/init.js';
import { rmSync, existsSync } from 'fs';

// 清理测试数据库
const testDataDir = new URL('../../data', import.meta.url).pathname;

describe('Neural Engine', async () => {
  let db;

  before(async () => {
    await initDb();
    const rawDb = getDb();
    db = createDbWrapper(rawDb);
    // Reset user stats
    db.prepare('UPDATE users SET stat_health=30, stat_finance=20, stat_learning=25, stat_career=30, stat_social=25, stat_mental=30, stat_habits=20, stat_creativity=25').run();
  });

  it('should initialize influence matrix', async () => {
    const { initInfluenceMatrix, getInfluenceMatrix } = await import('../services/neural-engine.js');
    initInfluenceMatrix(db);
    const matrix = getInfluenceMatrix(db);
    assert.ok(matrix.health, 'matrix should have health dimension');
    assert.ok(matrix.health.mental > 0, 'health->mental weight should be positive');
    assert.ok(matrix.health.finance === 0, 'health->finance weight should be 0');
  });

  it('should propagate dimension changes', async () => {
    const { propagate } = await import('../services/neural-engine.js');
    const changes = propagate(db, db.prepare('SELECT id FROM users LIMIT 1').get().id, 'health', 5);
    assert.ok(Array.isArray(changes), 'should return changes array');
    assert.ok(changes.length > 0, 'should have at least one change');
    assert.equal(changes[0].dim, 'health', 'first change should be health');
    assert.ok(changes[0].delta > 0, 'delta should be positive');
  });

  it('should detect feedback cycles', async () => {
    const { detectFeedbackCycles } = await import('../services/neural-engine.js');
    const cycles = detectFeedbackCycles(db, db.prepare('SELECT id FROM users LIMIT 1').get().id);
    assert.ok(Array.isArray(cycles), 'should return array');
  });
});

describe('Energy Model', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should calculate current energy', async () => {
    const { calculateCurrentEnergy, getEnergyLevel } = await import('../services/energy-model.js');
    const energy = calculateCurrentEnergy(db, db.prepare('SELECT id FROM users LIMIT 1').get().id);
    assert.ok(typeof energy === 'number', 'energy should be a number');
    assert.ok(energy >= 0 && energy <= 100, 'energy should be 0-100');

    const level = getEnergyLevel(energy);
    assert.ok(level.level, 'should have level');
    assert.ok(level.label, 'should have label');
    assert.ok(level.color, 'should have color');
  });

  it('should return correct energy levels', async () => {
    const { getEnergyLevel } = await import('../services/energy-model.js');
    assert.equal(getEnergyLevel(90).level, 'burst');
    assert.equal(getEnergyLevel(70).level, 'high');
    assert.equal(getEnergyLevel(50).level, 'normal');
    assert.equal(getEnergyLevel(30).level, 'low');
    assert.equal(getEnergyLevel(10).level, 'exhausted');
  });

  it('should return energy breakdown', async () => {
    const { getEnergyBreakdown } = await import('../services/energy-model.js');
    const breakdown = getEnergyBreakdown(db, db.prepare('SELECT id FROM users LIMIT 1').get().id);
    assert.ok(breakdown.sleep, 'should have sleep');
    assert.ok(breakdown.exercise, 'should have exercise');
    assert.ok(breakdown.mood, 'should have mood');
    assert.ok(breakdown.streak, 'should have streak');
  });
});

describe('Balance Radar', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should classify shape correctly', async () => {
    const { classifyShape, calculateBalanceScore } = await import('../services/balance-radar.js');

    // All equal = plateau
    const plateau = classifyShape({ health: 50, finance: 50, learning: 50, career: 50, social: 50, mental: 50, habits: 50, creativity: 50 });
    assert.ok(['plateau', 'plateau_low', 'balanced_high'].includes(plateau), 'equal values should be plateau type');

    // One very high = needle (large range)
    const needle2 = classifyShape({ health: 90, finance: 30, learning: 30, career: 30, social: 30, mental: 30, habits: 30, creativity: 30 });
    assert.equal(needle2, 'needle', 'one high value with large range should be needle');

    // Large range = needle
    const needle = classifyShape({ health: 90, finance: 10, learning: 50, career: 50, social: 50, mental: 50, habits: 50, creativity: 50 });
    assert.equal(needle, 'needle', 'large range should be needle');

    // Balance score
    const score = calculateBalanceScore({ health: 50, finance: 50, learning: 50, career: 50, social: 50, mental: 50, habits: 50, creativity: 50 });
    assert.ok(score > 90, 'equal values should have high balance score');
  });

  it('should take balance snapshot', async () => {
    const { takeBalanceSnapshot } = await import('../services/balance-radar.js');
    const snapshot = takeBalanceSnapshot(db, db.prepare('SELECT id FROM users LIMIT 1').get().id);
    assert.ok(snapshot.dimValues, 'should have dimValues');
    assert.ok(snapshot.shapeType, 'should have shapeType');
    assert.ok(typeof snapshot.balanceScore === 'number', 'should have balanceScore');
    assert.ok(snapshot.narrative, 'should have narrative');
  });
});

describe('Memory System', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should add and retrieve memories', async () => {
    const { addMemory, retrieveMemories } = await import('../services/memory-system.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;

    const id = addMemory(db, userId, 'short_term', 'conversation', '测试记忆', '这是测试内容', '测试摘要', 7, 'test');
    assert.ok(id, 'should return memory id');

    const memories = retrieveMemories(db, userId, '测试');
    assert.ok(memories.length > 0, 'should find the memory');
    assert.equal(memories[0].title, '测试记忆');
  });

  it('should get context memories', async () => {
    const { getContextMemories } = await import('../services/memory-system.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const context = getContextMemories(db, userId);
    assert.ok('working' in context, 'should have working');
    assert.ok('shortTerm' in context, 'should have shortTerm');
    assert.ok('longTerm' in context, 'should have longTerm');
    assert.ok('all' in context, 'should have all');
  });

  it('should get memory stats', async () => {
    const { getMemoryStats } = await import('../services/memory-system.js');
    const stats = getMemoryStats(db, db.prepare('SELECT id FROM users LIMIT 1').get().id);
    assert.ok(typeof stats.working === 'number');
    assert.ok(typeof stats.shortTerm === 'number');
    assert.ok(typeof stats.longTerm === 'number');
    assert.ok(typeof stats.total === 'number');
  });
});

describe('Personality Mask', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should build context tags', async () => {
    const { buildContextTag } = await import('../services/personality-mask.js');
    const tag = buildContextTag('sad', 'emotional_support', 'evening', 'low');
    assert.equal(tag, 'sad:emotional_support:evening:low');
  });

  it('should select style', async () => {
    const { selectStyle } = await import('../services/personality-mask.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    const style = selectStyle(db, userId, ['sad:emotional_support:evening:low']);
    assert.ok(['encouraging', 'strict', 'funny'].includes(style));
  });

  it('should get time of day', async () => {
    const { getTimeOfDay } = await import('../services/personality-mask.js');
    const time = getTimeOfDay();
    assert.ok(['morning', 'afternoon', 'evening', 'late_night'].includes(time));
  });
});

describe('Decision Tracker', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should record and retrieve decisions', async () => {
    const { recordDecision, getDecisionHistory } = await import('../services/decision-tracker.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;

    const id = recordDecision(db, userId, '开始每天运动', 'health', 'test');
    assert.ok(id, 'should return decision id');

    const history = getDecisionHistory(db, userId);
    assert.ok(history.length > 0, 'should have decisions');
    assert.equal(history[0].decision_text, '开始每天运动');
  });
});

describe('Lifecycle', async () => {
  it('should detect life stage', async () => {
    const { detectLifeStage } = await import('../services/lifecycle.js');

    const stage25 = detectLifeStage({ birth_year: 2001 });
    assert.equal(stage25.stage, 'establishment');

    const stage30 = detectLifeStage({ birth_year: 1994 });
    assert.equal(stage30.stage, 'deepening');

    const stage40 = detectLifeStage({ birth_year: 1985 });
    assert.equal(stage40.stage, 'stable');

    const noStage = detectLifeStage(null);
    assert.equal(noStage, null);
  });

  it('should return stage templates', async () => {
    const { getStageTaskTemplates } = await import('../services/lifecycle.js');
    const templates = getStageTaskTemplates({ birth_year: 2001 });
    assert.ok(templates.learning, 'should have learning templates');
    assert.ok(templates.career, 'should have career templates');
  });
});

describe('Dialogue Engine', async () => {
  it('should detect follow-up needs', async () => {
    const { shouldFollowUp } = await import('../services/dialogue-engine.js');

    // Emotion support
    const result1 = shouldFollowUp('今天好难过', { emotion: 'sad', intent: 'general' }, []);
    assert.ok(result1.should, 'sad emotion should trigger follow-up');
    assert.equal(result1.followUpType, 'emotion');

    // Short reply
    const result2 = shouldFollowUp('嗯', { emotion: null, intent: 'general' }, []);
    assert.ok(!result2.should, 'short reply should not trigger follow-up');
  });

  it('should generate follow-up text', async () => {
    const { generateFollowUp } = await import('../services/dialogue-engine.js');
    const text = generateFollowUp('今天好难过', { emotion: 'sad' }, 'emotion', '主人');
    assert.ok(text.length > 0, 'should return non-empty text');
  });
});

describe('Social Graph', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should extract social from message', async () => {
    const { extractSocialFromMessage } = await import('../services/social-graph.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;

    const result = extractSocialFromMessage(db, userId, '今天和小王一起吃饭了');
    assert.ok(result, 'should extract person');
    assert.equal(result.name, '小王');
  });

  it('should get social graph', async () => {
    const { getSocialGraph } = await import('../services/social-graph.js');
    const graph = getSocialGraph(db, db.prepare('SELECT id FROM users LIMIT 1').get().id);
    assert.ok(Array.isArray(graph));
  });
});

describe('Data Quality', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should record extracted data', async () => {
    const { recordExtractedData, getDataConfidence } = await import('../services/data-quality.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;

    const id = recordExtractedData(db, userId, 'chat', 'health', '体重70kg', { value: 70 }, 0.8);
    assert.ok(id, 'should return id');

    const confidence = getDataConfidence(db, userId, 'health');
    assert.ok(confidence.confidence > 0, 'should have confidence');
    assert.ok(confidence.samples > 0, 'should have samples');
  });
});

describe('Habit Stacking', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should find anchor habits', async () => {
    const { findAnchorHabits } = await import('../services/habit-stacking.js');
    const anchors = findAnchorHabits(db, db.prepare('SELECT id FROM users LIMIT 1').get().id);
    assert.ok(Array.isArray(anchors));
  });

  it('should get user stacks', async () => {
    const { getUserStacks } = await import('../services/habit-stacking.js');
    const stacks = getUserStacks(db, db.prepare('SELECT id FROM users LIMIT 1').get().id);
    assert.ok(Array.isArray(stacks));
  });
});

describe('Gamification Deep', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should initialize story arcs', async () => {
    const { initStoryArcs } = await import('../services/gamification-deep.js');
    initStoryArcs(db); // Should not throw
  });

  it('should get current cat form', async () => {
    const { getCurrentCatForm } = await import('../services/gamification-deep.js');
    const form = getCurrentCatForm(db, 1);
    assert.equal(form.form_name, '普通小猫');
  });

  it('should get next cat form', async () => {
    const { initCatEvolutions, getNextCatForm } = await import('../services/gamification-deep.js');
    initCatEvolutions(db);
    const next = getNextCatForm(db, 1);
    assert.ok(next, 'should have next form');
    assert.equal(next.level_required, 5);
  });

  it('should check title unlocks', async () => {
    const { checkTitleUnlocks } = await import('../services/gamification-deep.js');
    const unlocked = checkTitleUnlocks(db, db.prepare('SELECT id FROM users LIMIT 1').get().id);
    assert.ok(Array.isArray(unlocked));
  });
});

describe('Smart Notifications', async () => {
  let db;

  before(async () => {
    await initDb();
    db = createDbWrapper(getDb());
  });

  it('should check if should notify', async () => {
    const { shouldNotify } = await import('../services/smart-notifications.js');
    const result = shouldNotify(db, db.prepare('SELECT id FROM users LIMIT 1').get().id, 'normal');
    assert.ok('should' in result);
    assert.ok('reason' in result);
  });

  it('should log notification', async () => {
    const { logNotification, getNotificationStats } = await import('../services/smart-notifications.js');
    const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;
    logNotification(db, userId, 'test', 'normal', '测试消息');
    const stats = getNotificationStats(db, userId);
    assert.ok(stats.total > 0);
  });
});
