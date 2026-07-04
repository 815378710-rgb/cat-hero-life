// 猫猫侠 神经智能系统 API路由
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { propagate, getInfluenceMatrix, detectFeedbackCycles, learnWeightsFromData, getRecentPropagations, initInfluenceMatrix } from '../services/neural-engine.js';
import { calculateCurrentEnergy, getEnergyLevel, getEnergyBreakdown, predictEnergyCurve, learnEnergyBaseline } from '../services/energy-model.js';
import { recordDecision, checkDecisionOutcome, getPendingChecks, getDecisionHistory } from '../services/decision-tracker.js';
import { takeBalanceSnapshot, getBalanceTrend, classifyShape, calculateBalanceScore } from '../services/balance-radar.js';
import { findAnchorHabits, suggestHabitStack, createHabitStack, getUserStacks, recordStackResult } from '../services/habit-stacking.js';
import { selectStyle, recordInteraction, getPersonalityEvolution, buildContextTag, getTimeOfDay, inferUserReaction } from '../services/personality-mask.js';
import { upsertSocialPerson, recordInteraction as recordSocialInteraction, extractSocialFromMessage, generateSocialInsights, getSocialGraph } from '../services/social-graph.js';
import { addMemory, retrieveMemories, getContextMemories, consolidateMemories, decayMemories, getMemoryStats, extractFromConversation } from '../services/memory-system.js';
import { shouldFollowUp, generateFollowUp, analyzeConversationRhythm, suggestProactiveTopic } from '../services/dialogue-engine.js';
import { shouldNotify, logNotification, markOpened, markResponded, getNotificationStats, getBestNotificationTimes, learnActivityPattern } from '../services/smart-notifications.js';
import { initStoryArcs, initQuestChains, initCatEvolutions, initTitles, getCurrentCatForm, getNextCatForm, checkTitleUnlocks, getUserTitles, equipTitle, getQuestProgress } from '../services/gamification-deep.js';
import { recordExtractedData, detectConflicts, getDataConfidence, getWeightedValue, getPendingConfirmations, verifyData } from '../services/data-quality.js';
import { detectLifeStage, getStageTone, getStageTaskTemplates, getStageAdviceStyle } from '../services/lifecycle.js';

const router = Router();

// ===== 神经传播系统 =====
router.get('/neural/matrix', (req, res) => {
  try { res.json({ matrix: getInfluenceMatrix(req.db) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/neural/propagate', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const { dimension, delta } = req.body;
    if (!dimension || delta === undefined) return res.status(400).json({ error: '缺少dimension或delta' });
    const changes = propagate(req.db, user.id, dimension, delta);
    res.json({ changes, propagated: changes.length > 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/neural/cycles', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json({ cycles: detectFeedbackCycles(req.db, user.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/neural/learn', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    learnWeightsFromData(req.db, user.id);
    res.json({ success: true, matrix: getInfluenceMatrix(req.db) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/neural/history', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json({ propagations: getRecentPropagations(req.db, user.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 能量系统 =====
router.get('/energy/current', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const energy = calculateCurrentEnergy(req.db, user.id);
    const level = getEnergyLevel(energy);
    const breakdown = getEnergyBreakdown(req.db, user.id);
    res.json({ energy, level, breakdown });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/energy/curve', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json({ curve: predictEnergyCurve(req.db, user.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/energy/learn', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    learnEnergyBaseline(req.db, user.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 决策追踪 =====
router.post('/decisions/record', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const { decision, dimension, source } = req.body;
    const id = recordDecision(req.db, user.id, decision, dimension, source);
    res.json({ id, recorded: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/decisions/pending', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const pending = getPendingChecks(req.db, user.id);
    // 自动检查
    const results = [];
    for (const d of pending) {
      const outcome = checkDecisionOutcome(req.db, d.id, d.checkType);
      if (outcome) results.push(outcome);
    }
    res.json({ pending: pending.length, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/decisions/history', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json({ decisions: getDecisionHistory(req.db, user.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 人生平衡雷达 =====
router.get('/balance/snapshot', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const snapshot = takeBalanceSnapshot(req.db, user.id);
    res.json(snapshot);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/balance/trend', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const days = parseInt(req.query.days) || 30;
    res.json({ trend: getBalanceTrend(req.db, user.id, days) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 习惯嫁接 =====
router.get('/habit-stacking/anchors', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json({ anchors: findAnchorHabits(req.db, user.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/habit-stacking/suggest', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const { habitId } = req.body;
    const suggestion = suggestHabitStack(req.db, user.id, habitId);
    res.json({ suggestion });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/habit-stacking/create', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const { newHabitId, anchorHabitId, moment } = req.body;
    const id = createHabitStack(req.db, user.id, newHabitId, anchorHabitId, moment);
    res.json({ id, created: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/habit-stacking/list', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json({ stacks: getUserStacks(req.db, user.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 人格面具 =====
router.get('/personality/evolution', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json({ evolution: getPersonalityEvolution(req.db, user.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/personality/select-style', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const { emotion, topic, energy } = req.body;
    const timeOfDay = getTimeOfDay();
    const tags = [buildContextTag(emotion, topic, timeOfDay, energy)];
    const style = selectStyle(req.db, user.id, tags);
    res.json({ style, context: tags });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 社交图谱 =====
router.get('/social/graph', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json({ graph: getSocialGraph(req.db, user.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/social/insights', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json({ insights: generateSocialInsights(req.db, user.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/social/person', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const { name, relationship } = req.body;
    const id = upsertSocialPerson(req.db, user.id, name, relationship);
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/social/interaction', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const { personId, type, emotionBefore, emotionAfter, context } = req.body;
    const id = recordSocialInteraction(req.db, user.id, personId, type, emotionBefore, emotionAfter, context);
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 记忆系统 =====
router.get('/memory/context', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json(getContextMemories(req.db, user.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/memory/search', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const { query } = req.query;
    res.json({ memories: retrieveMemories(req.db, user.id, query) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/memory/stats', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json(getMemoryStats(req.db, user.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/memory/consolidate', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const count = consolidateMemories(req.db, user.id);
    res.json({ consolidated: count });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 深度对话 =====
router.post('/dialogue/analyze', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const { message, analysis } = req.body;
    const followUp = shouldFollowUp(message, analysis, []);
    const rhythm = analyzeConversationRhythm(req.db, user.id);
    let followUpText = null;
    if (followUp.should) {
      followUpText = generateFollowUp(message, analysis, followUp.followUpType, user.username);
    }
    res.json({ followUp, rhythm, followUpText });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/dialogue/proactive', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json(suggestProactiveTopic(req.db, user.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 智能通知 =====
router.get('/notifications/should-send', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const { priority } = req.query;
    res.json(shouldNotify(req.db, user.id, priority));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/notifications/stats', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json(getNotificationStats(req.db, user.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/notifications/best-times', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json({ times: getBestNotificationTimes(req.db, user.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 游戏化深化 =====
router.get('/gamification/cat-form', (req, res) => {
  try {
    const user = req.db.prepare('SELECT level FROM users LIMIT 1').get();
    const current = getCurrentCatForm(req.db, user.level);
    const next = getNextCatForm(req.db, user.level);
    res.json({ current, next });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/gamification/titles', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const newUnlocks = checkTitleUnlocks(req.db, user.id);
    const titles = getUserTitles(req.db, user.id);
    res.json({ titles, newUnlocks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/gamification/equip-title', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    const { titleId } = req.body;
    equipTitle(req.db, user.id, titleId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/gamification/quests', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json({ quests: getQuestProgress(req.db, user.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 数据质量 =====
router.get('/data-quality/conflicts', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json({ pending: getPendingConfirmations(req.db, user.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/data-quality/verify', (req, res) => {
  try {
    const { dataId, correctedValue } = req.body;
    verifyData(req.db, dataId, correctedValue);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/data-quality/confidence/:type', (req, res) => {
  try {
    const user = req.db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json(getDataConfidence(req.db, user.id, req.params.type));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 生命周期 =====
router.get('/lifecycle/stage', (req, res) => {
  try {
    const profile = req.db.prepare('SELECT * FROM life_profile WHERE user_id = (SELECT id FROM users LIMIT 1)').get();
    const stage = detectLifeStage(profile);
    const tone = getStageTone(profile);
    const templates = getStageTaskTemplates(profile);
    const advice = getStageAdviceStyle(profile);
    res.json({ stage, tone, templates, advice });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 初始化 =====
router.post('/init', (req, res) => {
  try {
    const db = req.db;
    initInfluenceMatrix(db);
    initStoryArcs(db);
    initQuestChains(db);
    initCatEvolutions(db);
    initTitles(db);
    res.json({ success: true, message: '神经智能系统初始化完成' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
