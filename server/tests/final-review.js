// 猫猫侠 - 日常对话场景全面测试
import { initDb, getDb, createDbWrapper } from '../db/init.js';
import { analyzeMessage } from '../services/ai-engine.js';
import { calculateCurrentEnergy, getEnergyLevel } from '../services/energy-model.js';
import { getContextMemories } from '../services/memory-system.js';
import { selectStyle, buildContextTag, getTimeOfDay } from '../services/personality-mask.js';
import { shouldFollowUp } from '../services/dialogue-engine.js';

await initDb();
const db = createDbWrapper(getDb());
const userId = db.prepare('SELECT id FROM users LIMIT 1').get().id;

const scenarios = [
  // 日常闲聊
  { msg: '你在干嘛', expectIntent: 'greeting', expectEmotion: null },
  { msg: '你好', expectIntent: 'greeting', expectEmotion: null },
  { msg: '在吗', expectIntent: 'greeting', expectEmotion: null },
  { msg: '早上好', expectIntent: 'greeting', expectEmotion: null },
  { msg: '晚安', expectIntent: 'greeting', expectEmotion: null },
  { msg: '今天天气真好', expectIntent: 'general', expectEmotion: null },
  { msg: '好无聊啊', expectIntent: 'general', expectEmotion: null },
  
  // 情绪表达
  { msg: '今天好累啊', expectIntent: 'general', expectEmotion: 'tired' },
  { msg: '好困', expectIntent: 'general', expectEmotion: 'tired' },
  { msg: '我好难过', expectIntent: 'general', expectEmotion: 'sad' },
  { msg: '心情不好', expectIntent: 'general', expectEmotion: 'sad' },
  { msg: '我好焦虑', expectIntent: 'general', expectEmotion: 'anxious' },
  { msg: '压力好大', expectIntent: 'general', expectEmotion: 'anxious' },
  { msg: '气死我了', expectIntent: 'general', expectEmotion: 'angry' },
  { msg: '好孤独', expectIntent: 'general', expectEmotion: 'lonely' },
  { msg: '我好开心', expectIntent: 'general', expectEmotion: 'happy' },
  { msg: '今天心情不错', expectIntent: 'general', expectEmotion: 'happy' },
  { msg: '我要加油', expectIntent: 'general', expectEmotion: 'motivated' },
  
  // 功能相关
  { msg: '今天有什么任务', expectIntent: 'task', expectEmotion: null },
  { msg: '帮我签到', expectIntent: 'signin', expectEmotion: null },
  { msg: '看看我的属性', expectIntent: 'stats', expectEmotion: null },
  { msg: '有什么成就', expectIntent: 'achievements', expectEmotion: null },
  { msg: '给我点建议', expectIntent: 'life_advice', expectEmotion: null },
  { msg: '怎么提升自己', expectIntent: 'plan', expectEmotion: null },
  { msg: '帮我做个规划', expectIntent: 'plan', expectEmotion: null },
  { msg: '你了解我吗', expectIntent: 'profile', expectEmotion: null },
  { msg: '帮我建档', expectIntent: 'onboarding', expectEmotion: null },
  { msg: '能做什么', expectIntent: 'help', expectEmotion: null },
  { msg: '记得上次的事吗', expectIntent: 'memory', expectEmotion: null },
  { msg: '给我讲个故事', expectIntent: 'narrative', expectEmotion: null },
  
  // 数据提取
  { msg: '我今天跑了5公里', expectIntent: 'general', expectEmotion: 'happy' },
  { msg: '花了80块吃饭', expectIntent: 'general', expectEmotion: null },
  { msg: '体重70公斤', expectIntent: 'general', expectEmotion: null },
  { msg: '昨晚12点才睡', expectIntent: 'general', expectEmotion: 'tired' },
  { msg: '学了2小时英语', expectIntent: 'general', expectEmotion: null },
  
  // 复杂情绪
  { msg: '最近压力好大，不知道该怎么办', expectIntent: 'life_advice', expectEmotion: 'anxious' },
  { msg: '我失眠了，好焦虑', expectIntent: 'general', expectEmotion: 'anxious' },
  { msg: '今天被领导骂了，好难过', expectIntent: 'general', expectEmotion: 'sad' },
  { msg: '我和女朋友吵架了', expectIntent: 'general', expectEmotion: 'sad' },
  { msg: '我升职了！太开心了', expectIntent: 'general', expectEmotion: 'happy' },
  { msg: '明天要考试，好紧张', expectIntent: 'general', expectEmotion: 'anxious' },
  { msg: '我想辞职', expectIntent: 'life_advice', expectEmotion: null },
  { msg: '我想学编程', expectIntent: 'plan', expectEmotion: null },
  { msg: '我辞职了', expectIntent: 'general', expectEmotion: null },
];

let pass = 0, fail = 0, issues = [];

for (const s of scenarios) {
  const analysis = analyzeMessage(s.msg);
  const intentOk = analysis.intent === s.expectIntent;
  const emotionOk = s.expectEmotion === null || analysis.emotion === s.expectEmotion;
  
  // 测试追问链
  const followUp = shouldFollowUp(s.msg, analysis, []);
  
  // 测试人格选择
  const timeOfDay = getTimeOfDay();
  const energy = calculateCurrentEnergy(db, userId);
  const energyLevel = getEnergyLevel(energy);
  const contextTag = buildContextTag(analysis.emotion, analysis.intent, timeOfDay, energyLevel.level);
  const style = selectStyle(db, userId, [contextTag]);
  
  if (intentOk && emotionOk) {
    pass++;
  } else {
    fail++;
    issues.push({
      msg: s.msg,
      expectIntent: s.expectIntent,
      gotIntent: analysis.intent,
      expectEmotion: s.expectEmotion,
      gotEmotion: analysis.emotion,
      followUp: followUp.should,
      style,
    });
  }
}

console.log(`\n====== 对话场景测试结果 ======`);
console.log(`总计: ${scenarios.length} | 通过: ${pass} | 失败: ${fail}`);
console.log(`通过率: ${Math.round(pass / scenarios.length * 100)}%`);

if (issues.length > 0) {
  console.log(`\n--- 未通过的场景 ---`);
  for (const i of issues) {
    console.log(`  Q: "${i.msg}"`);
    if (i.expectIntent !== i.gotIntent) console.log(`    意图: 期望=${i.expectIntent} 实际=${i.gotIntent}`);
    if (i.expectEmotion !== i.gotEmotion) console.log(`    情绪: 期望=${i.expectEmotion} 实际=${i.gotEmotion}`);
  }
}

// 测试神经传播
console.log(`\n====== 神经传播测试 ======`);
const { propagate, initInfluenceMatrix, getInfluenceMatrix } = await import('../services/neural-engine.js');
initInfluenceMatrix(db);

// 测试各种传播场景
const propTests = [
  { dim: 'health', delta: 5, desc: '运动后健康+5' },
  { dim: 'mental', delta: -3, desc: '情绪低落心理-3' },
  { dim: 'finance', delta: 10, desc: '收入增加财务+10' },
  { dim: 'learning', delta: 3, desc: '学习进步+3' },
  { dim: 'social', delta: 5, desc: '社交活动+5' },
];

for (const t of propTests) {
  // 重置属性
  db.prepare('UPDATE users SET stat_health=30, stat_finance=20, stat_learning=25, stat_career=30, stat_social=25, stat_mental=30, stat_habits=20, stat_creativity=25 WHERE id = ?').run(userId);
  const changes = propagate(db, userId, t.dim, t.delta);
  console.log(`  ${t.desc}: ${changes.length}个变化`);
  for (const c of changes) {
    console.log(`    ${c.dim}: ${c.from}→${c.to} (${c.delta > 0 ? '+' : ''}${c.delta}) depth=${c.depth}`);
  }
}

// 测试能量模型
console.log(`\n====== 能量模型测试 ======`);
const energy = calculateCurrentEnergy(db, userId);
const level = getEnergyLevel(energy);
console.log(`  能量值: ${energy}`);
console.log(`  等级: ${level.label}`);
console.log(`  建议: ${level.suggestion}`);
console.log(`  最大难度: ${level.maxDifficulty}`);

// 测试记忆系统
console.log(`\n====== 记忆系统测试 ======`);
const { addMemory, retrieveMemories, getMemoryStats } = await import('../services/memory-system.js');
addMemory(db, userId, 'short_term', 'conversation', '测试记忆1', '用户说今天跑了5公里', '运动记录', 6, 'chat');
addMemory(db, userId, 'short_term', 'emotion', '情绪低落', '用户说心情不好', '情绪记录', 7, 'chat');
addMemory(db, userId, 'working', 'conversation', '日常聊天', '用户问天气', '闲聊', 3, 'chat');
const memStats = getMemoryStats(db, userId);
console.log(`  工作记忆: ${memStats.working}`);
console.log(`  短期记忆: ${memStats.shortTerm}`);
console.log(`  长期记忆: ${memStats.longTerm}`);
console.log(`  总计: ${memStats.total}`);

const searchResults = retrieveMemories(db, userId, '测试');
console.log(`  搜索"测试": ${searchResults.length}条结果`);
const searchResults2 = retrieveMemories(db, userId, '情绪');
console.log(`  搜索"情绪": ${searchResults2.length}条结果`);

// 测试社交提取
console.log(`\n====== 社交提取测试 ======`);
const { extractSocialFromMessage, getSocialGraph } = await import('../services/social-graph.js');
const socialTests = [
  '今天和小王一起吃饭了',
  '跟老张聊了很久',
  '约了小李打球',
  '和妈妈打了电话',
  '今天天气不错',
];
for (const msg of socialTests) {
  const result = extractSocialFromMessage(db, userId, msg);
  console.log(`  "${msg}" → ${result ? result.name : '无'}`);
}
const graph = getSocialGraph(db, userId);
console.log(`  社交图谱: ${graph.length}人`);

// 测试数据质量
console.log(`\n====== 数据质量测试 ======`);
const { recordExtractedData, detectConflicts, getDataConfidence } = await import('../services/data-quality.js');
recordExtractedData(db, userId, 'chat', 'weight', '体重70kg', { value: 70 }, 0.8);
recordExtractedData(db, userId, 'chat', 'weight', '体重72kg', { value: 72 }, 0.7);
const conflict = detectConflicts(db, userId, 75, 'weight');
console.log(`  记录70kg后记录72kg: ${conflict ? '检测到冲突' : '无冲突'}`);
const confidence = getDataConfidence(db, userId, 'weight');
console.log(`  体重数据可信度: ${confidence.confidence} (${confidence.samples}条)`);

// 测试人格面具
console.log(`\n====== 人格面具测试 ======`);
const currentTimeOfDay = getTimeOfDay();
const personalityTests = [
  { emotion: 'sad', topic: 'emotional_support', energy: 'low' },
  { emotion: 'happy', topic: 'casual', energy: 'high' },
  { emotion: 'anxious', topic: 'life_advice', energy: 'medium' },
  { emotion: null, topic: 'task', energy: 'normal' },
];
for (const t of personalityTests) {
  const tag = buildContextTag(t.emotion, t.topic, currentTimeOfDay, t.energy);
  const style = selectStyle(db, userId, [tag]);
  console.log(`  ${tag} → ${style}`);
}

// 测试生命周期
console.log(`\n====== 生命周期测试 ======`);
const { detectLifeStage, getStageTaskTemplates } = await import('../services/lifecycle.js');
const stages = [
  { year: 2004, desc: '22岁' },
  { year: 1999, desc: '27岁' },
  { year: 1992, desc: '34岁' },
  { year: 1982, desc: '44岁' },
  { year: 1970, desc: '56岁' },
];
for (const s of stages) {
  const stage = detectLifeStage({ birth_year: s.year });
  console.log(`  ${s.desc}: ${stage ? stage.name : '未知'}`);
}

console.log(`\n====== 审查完成 ======`);

process.exit(0);
