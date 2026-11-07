// 理论引擎单元测试（审计 #22）
// 覆盖: reward-model / ethics-guard / behavioral-biases / meaning-engine / social-support / explainability
// 运行: node --test server/tests/theory-engines.test.js
// 说明: 纯函数无需数据库; reward-model 需 better-sqlite3，若当前环境缺少原生绑定则自动跳过该用例。
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ===== 1. reward-model（神经科学奖赏模型）=====
test('reward-model: computeReward 返回合法奖赏且含多巴胺/惊喜字段', async (t) => {
  let Database;
  try {
    Database = (await import('better-sqlite3')).default;
  } catch (e) {
    t.skip('better-sqlite3 包不可用，跳过 reward DB 用例');
    return;
  }
  let db;
  try {
    db = new Database(':memory:');
  } catch (e) {
    t.skip('better-sqlite3 原生绑定在当前环境不可用，跳过 reward DB 用例');
    return;
  }
  db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, level INTEGER DEFAULT 1, consecutive_sign_days INTEGER DEFAULT 0)`);
  db.prepare('INSERT INTO users (id, level, consecutive_sign_days) VALUES (?,?,?)').run('u1', 5, 10);

  const { computeReward } = await import('../services/reward-model.js');
  // 首次（新鲜）：应给满基础奖励
  const r1 = computeReward(db, 'u1', { type: 'checkin', dimension: 'health', baseExp: 10, baseCoins: 5 });
  assert.equal(typeof r1.exp, 'number');
  assert.ok(r1.exp >= 1, '经验至少为 1');
  assert.ok(r1.coins >= 0, '金币非负');
  assert.ok(r1.dopamineSignal >= 0 && r1.dopamineSignal <= 1, '多巴胺信号在 [0,1]');
  assert.equal(typeof r1.surprise, 'boolean');
  assert.equal(typeof r1.satiation, 'number');

  // 连续重复同动作：享乐适应应使经验不高于首次（边际递减）
  const r2 = computeReward(db, 'u1', { type: 'checkin', dimension: 'health', baseExp: 10, baseCoins: 5 });
  assert.ok(r2.exp <= r1.exp, '重复动作的经验应<=首次（享乐适应）');
  assert.ok(r2.satiation >= r1.satiation, '饱和值应随重复上升');
});

// ===== 2. ethics-guard（四原则伦理门控）=====
test('ethics-guard: 危机信号被正确识别', async () => {
  const { assessCrisis, guardReply } = await import('../services/ethics-guard.js');
  const crisis = assessCrisis('我真的想自杀');
  assert.equal(crisis.level, 'crisis');
  assert.equal(crisis.needsHuman, true);

  const none = assessCrisis('今天天气不错');
  assert.equal(none.level, 'none');

  const g = guardReply('别想了，开心点', { crisisLevel: 'crisis' });
  assert.equal(typeof g.text, 'string');
  assert.equal(typeof g.passed, 'boolean');
});

// ===== 3. behavioral-biases（行为经济学偏见引擎）=====
test('behavioral-biases: 能检测损失厌恶与现时偏好', async () => {
  const { detectBiases, summarizeBiasTendency } = await import('../services/behavioral-biases.js');
  const r = detectBiases('我怕亏钱，所以一直舍不得止损，想以后再说');
  const keys = r.biases.map(b => b.key);
  assert.ok(keys.includes('loss_aversion'), '应包含损失厌恶');
  assert.ok(keys.includes('present_bias'), '应包含现时偏好');
  assert.ok(r.dominant, '应有主导偏误');

  const sum = summarizeBiasTendency([{ decision_text: '怕亏所以没止损' }, { decision_text: '先玩以后再说' }]);
  assert.equal(sum.totalDecisions, 2);
  assert.ok(Array.isArray(sum.tendencies));
});

// ===== 4. meaning-engine（意义层：价值检测）=====
test('meaning-engine: 能检测文本中的核心价值', async () => {
  const { detectValues, VALUE_INVENTORY } = await import('../services/meaning-engine.js');
  const v = detectValues('我一直在追求自由，也希望能更有创造力');
  assert.ok(Array.isArray(v.values), 'values 应为数组');
  assert.ok(v.values.length > 0, '应检测到至少一个价值');
  const keys = v.values.map(x => x.key);
  assert.ok(keys.includes('freedom') || keys.includes('creativity'), '应识别自由或创造');
  assert.ok(VALUE_INVENTORY.length > 0, '价值清单非空');
});

// ===== 5. social-support（社会层：支持网络评估 + 文化真实性）=====
test('social-support: 支持网络缺口评估 & 文化标记识别', async () => {
  const { classifySupportType, assessSupportNetwork, assessCulturalFit } = await import('../services/social-support.js');
  assert.deepEqual(classifySupportType('family').sort(), ['emotional', 'instrumental']);

  // 只有情感支持来源 → 工具/信息支持应存在缺口
  const net = assessSupportNetwork([{ relationship: 'friend' }, { relationship: 'partner' }]);
  assert.ok(net.gaps.length > 0, '应检测到支持类型缺口');
  assert.ok(net.adequacy >= 0 && net.adequacy <= 1, '充足度在 [0,1]');

  const fit = assessCulturalFit('我要孝顺父母，不能丢家人的面子');
  assert.equal(fit.needsCulturalCare, true, '应识别到中国家庭/面子文化语境');
});

// ===== 6. explainability（交叉层：HCAI 可解释性）=====
test('explainability: 维度变化/奖励/助推 解释可生成人话', async () => {
  const { explainDimensionChange, explainReward, explainNudge, alifeFraming } = await import('../services/explainability.js');
  const d = explainDimensionChange({ dim: 'health', change: 5, reason: '今日运动打卡' });
  assert.equal(typeof d.human, 'string');
  assert.ok(d.human.length > 0);

  const r = explainReward({ exp: 20, coins: 10, surprise: true, dopamineSignal: 0.8 });
  assert.equal(typeof r.human, 'string');

  const n = explainNudge({ key: 'loss_aversion', name: '损失厌恶', nudge: '把不做长期代价摆上天平' });
  assert.equal(typeof n.human, 'string');

  const a = alifeFraming({ level: 3, evolution: '成长期', streak: 12 });
  assert.equal(typeof a.human, 'string');
});
