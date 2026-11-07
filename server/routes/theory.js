// 理论引擎可观测接口 — 暴露各理论层引擎, 便于验证与调试
// 所有接口均为只读/计算, 不改动业务主流程。
import { Router } from 'express';
import { getDb } from '../db/init.js';
import { computeReward, getRewardSatiation } from '../services/reward-model.js';
import { assessCrisis, guardReply, guardProactive, ETHICAL_PRINCIPLES } from '../services/ethics-guard.js';
import { detectBiases, summarizeBiasTendency } from '../services/behavioral-biases.js';
import { detectValues, narrativeIdentityArc, VALUE_INVENTORY, valueClarificationPrompt } from '../services/meaning-engine.js';
import { assessSupportNetwork, assessCulturalFit, SUPPORT_TYPE_LABELS } from '../services/social-support.js';
import { explainDimensionChange, explainProactivePush, explainReward, explainNudge, alifeFraming } from '../services/explainability.js';
import { getBigFiveProfile, buildBigFiveContext } from '../services/bigfive-engine.js';

const router = Router();

// 理论层总览 + 伦理四原则(系统价值立场)
router.get('/overview', (_req, res) => {
  res.json({
    system: 'cat-hero-life',
    grounded: true,
    layers: {
      base: 'CS/AI · 数据科学 · HCI',
      cognitive: '认知科学 · 神经科学(奖赏) · 人格 · 情绪 · 行为经济学',
      social: '社会学 · 社会心理学 · 人类学(文化真实性)',
      meaning: '哲学/伦理 · 意识哲学 · 文学叙事',
      cross: 'HCAI · HAII · 计算认知建模 · 人工生命',
    },
    ethicalPrinciples: ETHICAL_PRINCIPLES,
    engines: [
      'reward-model', 'ethics-guard', 'behavioral-biases',
      'meaning-engine', 'social-support', 'explainability',
    ],
  });
});

// 神经科学奖赏模型: 试算一次行为的主观奖赏
router.post('/reward', (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const userId = user?.id || 'demo';
    const action = req.body.action || { type: 'checkin', dimension: 'health', baseExp: 10, baseCoins: 5, rarity: 'common' };
    const result = computeReward(db, userId, action);
    res.json({ ok: true, userId, action, reward: result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 奖赏饱和概览
router.get('/reward/satiation', (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json({ ok: true, satiation: getRewardSatiation(db, user?.id || 'demo') });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 伦理: 危机评估
router.post('/ethics/assess', (req, res) => {
  try {
    res.json({ ok: true, crisis: assessCrisis(req.body.message || '') });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 伦理: 回复门控
router.post('/ethics/guard', (req, res) => {
  try {
    const out = guardReply(req.body.text || '', req.body.ctx || {});
    res.json({ ok: true, ...out });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 伦理: 主动推送门控
router.post('/ethics/proactive', (req, res) => {
  try {
    res.json({ ok: true, ...guardProactive(req.body.message || '', req.body.ctx || {}) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 行为经济学: 偏见检测
router.post('/biases', (req, res) => {
  try {
    const { biases, dominant } = detectBiases(req.body.text || '');
    res.json({ ok: true, biases, dominant });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 行为经济学: 近期决策偏误倾向
router.post('/biases/summary', (req, res) => {
  try {
    const decisions = Array.isArray(req.body.decisions) ? req.body.decisions : [];
    res.json({ ok: true, ...summarizeBiasTendency(decisions) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ===== 意义层 (🧭 Philosophy / Narratology) =====
// 价值识别
router.post('/meaning/values', (req, res) => {
  try {
    res.json({ ok: true, ...detectValues(req.body.text || '') });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 叙事身份弧光
router.post('/meaning/narrative', (req, res) => {
  try {
    const user = req.body.user || {};
    res.json({ ok: true, ...narrativeIdentityArc(user, !!req.body.recentActive) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 价值清单 + 澄清提问
router.get('/meaning/inventory', (_req, res) => {
  try {
    res.json({ ok: true, inventory: VALUE_INVENTORY, clarificationPrompt: valueClarificationPrompt() });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ===== 社会层 (🌍 Sociology / Anthropology) =====
// 社会支持网络评估
router.post('/social/support', (req, res) => {
  try {
    const people = Array.isArray(req.body.people) ? req.body.people : [];
    res.json({ ok: true, labels: SUPPORT_TYPE_LABELS, ...assessSupportNetwork(people) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 文化真实性检测
router.post('/social/cultural', (req, res) => {
  try {
    res.json({ ok: true, ...assessCulturalFit(req.body.text || '') });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ===== 交叉层 (🧩 HCAI / Artificial Life) =====
// 解释维度变化
router.post('/explain/dimension', (req, res) => {
  try {
    res.json({ ok: true, ...explainDimensionChange(req.body || {}) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 解释主动推送
router.post('/explain/proactive', (req, res) => {
  try {
    res.json({ ok: true, ...explainProactivePush(req.body || {}) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 解释奖赏
router.post('/explain/reward', (req, res) => {
  try {
    res.json({ ok: true, ...explainReward(req.body.reward || {}) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 解释偏见提示
router.post('/explain/nudge', (req, res) => {
  try {
    res.json({ ok: true, ...explainNudge(req.body.bias || {}) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// 人工生命隐喻
router.post('/alife/framing', (req, res) => {
  try {
    res.json({ ok: true, ...alifeFraming(req.body || {}) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ===== 大五人格 (OCEAN Model) =====
router.get('/bigfive/profile', (req, res) => {
  try {
    const db = req.db;
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (!user) return res.json({ profile: null });
    res.json({ profile: getBigFiveProfile(db, user.id) });
  } catch(e) { res.json({ error: e.message }); }
});

router.get('/bigfive/context', (req, res) => {
  try {
    const db = req.db;
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (!user) return res.json({ context: '' });
    res.json({ context: buildBigFiveContext(db, user.id) });
  } catch(e) { res.json({ error: e.message }); }
});

export default router;
