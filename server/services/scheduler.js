import cron from 'node-cron';
import { getDb, createDbWrapper, saveDb } from '../db/init.js';
import { v4 as uuid } from 'uuid';
import { getToday } from '../utils/timezone.js';
import { applyPunishment } from './life-engine.js';
import { generateDynamicEvent, generateNarrative } from './life-engine.js';
import { sendToSelf } from './wechat-service.js';
import { pushToFeishu } from './feishu-service.js';
import { takeBalanceSnapshot } from './balance-radar.js';
import { consolidateMemories, decayMemories } from './memory-system.js';
import { learnEnergyBaseline, calculateCurrentEnergy, getEnergyLevel } from './energy-model.js';
import { learnWeightsFromData, detectFeedbackCycles } from './neural-engine.js';
import { getPendingChecks, checkDecisionOutcome } from './decision-tracker.js';
import { checkTitleUnlocks } from './gamification-deep.js';
import { shouldNotify, logNotification, learnActivityPattern } from './smart-notifications.js';
import { initSmartReminders } from './smart-reminders.js';
import { chatWithLLM, isAiEnabled, llmPlanTasks, llmShouldReachOut, llmGenerateReview } from './ai-engine.js';
import { runDailyAnalysis } from './ai-analyst.js';
import { GAMES, syncDraws, resolvePendingIssues, backfillDrawDates, checkTicket, buildResultMessage } from './lottery-service.js';
import { existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

function getWrappedDb() { return createDbWrapper(getDb()); }

// ===== 数据库自动备份 =====
// 历史遗留：备份一直是容器里手工/外部脚本在做，9-26 容器重建后就断了，39 天没有新备份。
// 收进调度器，随代码走，重建容器也不会丢。
const _dir = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(_dir, '..', '..', 'data', 'backups');
const BACKUP_KEEP_DAYS = 14;

export function backupDatabase() {
  try {
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
    // 北京时区日期
    const day = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const dest = join(BACKUP_DIR, `cat-hero-${day}.db`);
    if (existsSync(dest)) unlinkSync(dest);
    const db = getDb();
    db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    const mb = existsSync(dest) ? (statSync(dest).size / 1048576).toFixed(1) : '?';
    console.log(`💾 数据库已备份: cat-hero-${day}.db (${mb} MB)`);

    const cutoff = Date.now() - BACKUP_KEEP_DAYS * 86400000;
    for (const f of readdirSync(BACKUP_DIR)) {
      const m = f.match(/^cat-hero-(\d{4}-\d{2}-\d{2})\.db$/);
      if (!m) continue;
      if (new Date(m[1] + 'T00:00:00+08:00').getTime() < cutoff) {
        try { unlinkSync(join(BACKUP_DIR, f)); console.log(`🗑️ 清理过期备份: ${f}`); } catch {}
      }
    }
  } catch (e) {
    console.error('数据库备份失败:', e.message);
  }
}

// 防重复注册：node --watch 热重载或重复调用 startScheduler 时，
// 否则同一时刻会有多份 cron 在跑，造成重复推送、重复扣分
let schedulerStarted = false;

export function startScheduler() {
  if (schedulerStarted) {
    console.warn('⏰ 调度器已在运行，跳过重复启动');
    return;
  }
  schedulerStarted = true;
  console.log('⏰ 定时任务调度器启动');

  // 7:30 早安 + 任务生成
  cron.schedule('30 7 * * *', () => {
    generateDailyTasks();
    triggerDialogue('morning', '每日早安');
  }, { timezone: 'Asia/Shanghai' });

  // 8:00 天气检查
  cron.schedule('0 8 * * *', () => { checkWeatherAndAdjust(); }, { timezone: 'Asia/Shanghai' });

  // 8:30 AI每日数据分析（推送到微信）
  cron.schedule('30 8 * * *', () => {
    runDailyAnalysis().catch(e => console.error('每日分析失败:', e.message));
  }, { timezone: 'Asia/Shanghai' });

  // 12:00 午间检查
  cron.schedule('0 12 * * *', () => { triggerDialogue('noon', '午间检查'); }, { timezone: 'Asia/Shanghai' });

  // 14:00 惩罚+随机关怀
  cron.schedule('0 14 * * *', () => {
    const db = getWrappedDb();
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (user) {
      const punishment = applyPunishment(db, user.id);
      if (punishment?.type === 'decay') addSystemMessage(`😿 主人... 你已经${punishment.days}天没来了，属性下降了${punishment.decay}点。快回来吧~`);
      else if (punishment?.type === 'coin_loss') addSystemMessage(`主人~ 你1天没来了，扣了${punishment.loss}金币 💰`);
    }
    if (Math.random() > 0.5) triggerDialogue('random', '随机关怀');
  }, { timezone: 'Asia/Shanghai' });

  // 15:00 不活跃检测
  cron.schedule('0 15 * * *', () => { checkInactivity(); }, { timezone: 'Asia/Shanghai' });

  // 18:00 鼓励
  cron.schedule('0 18 * * *', () => { triggerDialogue('encouragement', '傍晚鼓励'); }, { timezone: 'Asia/Shanghai' });

  // 21:00 复盘 + 叙事
  cron.schedule('0 21 * * *', () => {
    triggerDialogue('evening', '晚间复盘');
    generateDailyReport();
    addSystemMessage('🌙 晚间复盘时间到了~ 来和猫猫侠聊聊今天的感受吧！点击"每日复盘"开始~');
    catGainExp(5, '每日陪伴');
  }, { timezone: 'Asia/Shanghai' });

  // 23:00 催促
  cron.schedule('0 23 * * *', () => { checkPendingTasks(); }, { timezone: 'Asia/Shanghai' });

  // 周一 9:00 周报
  cron.schedule('0 9 * * 1', () => {
    addSystemMessage('新的一周开始了喵~ 📊 让我给你总结一下上周的表现吧！');
  }, { timezone: 'Asia/Shanghai' });

  // 周日 10:00 自动生成周计划
  cron.schedule('0 10 * * 0', () => { generateWeeklyPlan(); }, { timezone: 'Asia/Shanghai' });

  // 10:00 随机事件
  cron.schedule('0 10 * * *', () => { triggerDynamicEvent(); }, { timezone: 'Asia/Shanghai' });
  
  // 14:00 惊喜机制
  cron.schedule('0 14 * * *', () => { triggerSurprise(); }, { timezone: 'Asia/Shanghai' });

  // 11:00 叙事生成（每周一、四）
  cron.schedule('0 11 * * 1,4', () => { autoGenerateNarrative(); }, { timezone: 'Asia/Shanghai' });

  // ===== 彩票：开奖后自动对奖 =====
  // 大乐透周一/三/六 21:30 开奖，双色球周二/四/日 21:15
  // 22:10 主跑，23:40 补跑一次（官方数据偶尔延迟）
  cron.schedule('10 22 * * *', () => { runLotteryCheck('22:10'); }, { timezone: 'Asia/Shanghai' });
  cron.schedule('40 23 * * *', () => { runLotteryCheck('23:40 补跑'); }, { timezone: 'Asia/Shanghai' });
  // 开奖日 19:00 提醒买票（仅当已有用票习惯、且今天还没记录该玩法）
  cron.schedule('0 19 * * *', () => { remindLotteryBuy(); }, { timezone: 'Asia/Shanghai' });

  // ===== 神经智能系统定时任务 =====
  
  // 每天 23:30 人生平衡快照
  cron.schedule('30 23 * * *', () => {
    try {
      const db = getWrappedDb();
      const user = db.prepare('SELECT id FROM users LIMIT 1').get();
      if (user) takeBalanceSnapshot(db, user.id);
    } catch (e) { console.error('平衡快照失败:', e.message); }
  }, { timezone: 'Asia/Shanghai' });

  // 每天 2:00 记忆整理 (固化 + 衰减)
  cron.schedule('0 2 * * *', () => {
    try {
      const db = getWrappedDb();
      const user = db.prepare('SELECT id FROM users LIMIT 1').get();
      if (user) { consolidateMemories(db, user.id); decayMemories(db, user.id); }
    } catch (e) { console.error('记忆整理失败:', e.message); }
  }, { timezone: 'Asia/Shanghai' });

  // 每天 2:00 能量基线学习
  cron.schedule('0 2 * * *', () => {
    try {
      const db = getWrappedDb();
      const user = db.prepare('SELECT id FROM users LIMIT 1').get();
      if (user) learnEnergyBaseline(db, user.id);
    } catch (e) { console.error('能量学习失败:', e.message); }
  }, { timezone: 'Asia/Shanghai' });

  // 每天 3:00 权重学习
  cron.schedule('0 3 * * 0', () => {
    try {
      const db = getWrappedDb();
      const user = db.prepare('SELECT id FROM users LIMIT 1').get();
      if (user) learnWeightsFromData(db, user.id);
    } catch (e) { console.error('权重学习失败:', e.message); }
  }, { timezone: 'Asia/Shanghai' });

  // 每天 14:00 决策检查
  cron.schedule('0 14 * * *', () => {
    try {
      const db = getWrappedDb();
      const user = db.prepare('SELECT id FROM users LIMIT 1').get();
      if (user) {
        const pending = getPendingChecks(db, user.id);
        for (const d of pending) {
          const outcome = checkDecisionOutcome(db, d.id, d.checkType);
          if (outcome) addSystemMessage(`📋 决策回顾：${outcome.narrative}`);
        }
      }
    } catch (e) { console.error('决策检查失败:', e.message); }
  }, { timezone: 'Asia/Shanghai' });

  // 每天 10:00 称号检查
  cron.schedule('0 10 * * *', () => {
    try {
      const db = getWrappedDb();
      const user = db.prepare('SELECT id FROM users LIMIT 1').get();
      if (user) {
        const newTitles = checkTitleUnlocks(db, user.id);
        for (const t of newTitles) {
          addSystemMessage(`🏆 新称号解锁！${t.icon}「${t.name}」—— ${t.description}`);
        }
      }
    } catch (e) { console.error('称号检查失败:', e.message); }
  }, { timezone: 'Asia/Shanghai' });

  // 每天 20:00 反馈循环检测
  cron.schedule('0 20 * * *', () => {
    try {
      const db = getWrappedDb();
      const user = db.prepare('SELECT id FROM users LIMIT 1').get();
      if (user) {
        const cycles = detectFeedbackCycles(db, user.id);
        for (const c of cycles) {
          if (c.type === 'negative') addSystemMessage(`⚠️ ${c.description}`);
        }
      }
    } catch (e) { console.error('循环检测失败:', e.message); }
  }, { timezone: 'Asia/Shanghai' });

  // 每天 1:00 学习通知活跃模式
  cron.schedule('0 1 * * *', () => {
    try {
      const db = getWrappedDb();
      const user = db.prepare('SELECT id FROM users LIMIT 1').get();
      if (user) learnActivityPattern(db, user.id);
    } catch (e) { console.error('通知学习失败:', e.message); }
  }, { timezone: 'Asia/Shanghai' });

  // 每天 4:00 自动备份数据库
  cron.schedule('0 4 * * *', () => {
    try { saveDb(); console.log('📦 数据库自动备份完成'); } catch (e) { console.error('备份失败:', e.message); }
  }, { timezone: 'Asia/Shanghai' });

  // 每周日 5:00 LLM因果分析（反馈到神经权重）
  cron.schedule('0 5 * * 0', async () => {
    try {
      const db = getWrappedDb();
      const user = db.prepare('SELECT * FROM users LIMIT 1').get();
      if (!user || !isAiEnabled()) return;
      const { llmCausalAnalysis } = await import('./ai-engine.js');
      const recentEvents = db.prepare("SELECT created_at as date, content as description FROM chat_history WHERE user_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 20").all(user.id);
      const stats = { health: user.stat_health, finance: user.stat_finance, learning: user.stat_learning, career: user.stat_career, social: user.stat_social, mental: user.stat_mental, habits: user.stat_habits, creativity: user.stat_creativity };
      const causal = await llmCausalAnalysis(recentEvents, stats);
      if (causal?.causes) {
        const { updateWeight } = await import('./neural-engine.js');
        for (const cause of causal.causes) {
          if (cause.from && cause.to && cause.weight >= 0 && cause.weight <= 1) {
            updateWeight(db, cause.from, cause.to, cause.weight, 'llm');
          }
        }
        console.log('🧠 LLM因果分析完成，更新了', causal.causes.length, '个权重');
      }
    } catch (e) { console.error('LLM因果分析失败:', e.message); }
  }, { timezone: 'Asia/Shanghai' });

  // 智能提醒服务（基于真实状态的主动提醒）
  initSmartReminders(getWrappedDb());

  // 每天 3:00 数据库备份（保留 14 天）
  cron.schedule('0 3 * * *', () => { backupDatabase(); }, { timezone: 'Asia/Shanghai' });

  // 每周日凌晨3点清理过期数据
  cron.schedule('0 3 * * 0', () => {
    const db = getWrappedDb();
    try {
      // 清理30天前的旧日志和临时数据
      db.prepare("DELETE FROM emotion_logs WHERE created_at < datetime('now', '-30 days')").run();
      db.prepare("DELETE FROM wechat_logs WHERE created_at < datetime('now', '-30 days')").run();
      db.prepare("DELETE FROM ai_memory WHERE importance <= 1 AND created_at < datetime('now', '-30 days')").run();
      // 保留最近180天的聊天记录
      db.prepare("DELETE FROM chat_history WHERE created_at < datetime('now', '-180 days')").run();
      console.log('🧹 数据库清理完成');
    } catch(e) { console.error('清理失败:', e.message); }
  }, { timezone: 'Asia/Shanghai' });
}

async function triggerDialogue(type, reason) {
  const db = getWrappedDb();
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (!user) return;
  const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
  const userData = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  
  let message = null;
  
  // 尝试用LLM生成智能主动消息
  if (isAiEnabled()) {
    try {
      const today = getToday();
      const lastChat = db.prepare("SELECT created_at FROM chat_history WHERE user_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 1").get(user.id);
      const hoursSince = lastChat ? (Date.now() - new Date(lastChat.created_at)) / 3600000 : 999;
      const completed = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(user.id, today);
      const weakest = ['health','finance','learning','career','social','mental','habits','creativity'].map(d => ({ dim: d, val: userData['stat_'+d] })).sort((a, b) => a.val - b.val)[0];
      const energy = calculateCurrentEnergy(db, user.id);
      const recentEmotions = db.prepare('SELECT emotion_tag FROM ai_memory WHERE user_id = ? AND emotion_tag IS NOT NULL ORDER BY created_at DESC LIMIT 5').all(user.id).map(m => m.emotion_tag);
      
      const llmDecision = await llmShouldReachOut({
        lastActive: lastChat?.created_at,
        streak: userData.consecutive_sign_days,
        completedToday: completed.c,
        recentEmotions,
        weakestDim: weakest.dim,
        weakestVal: weakest.val,
        energy,
        hoursSinceLastChat: hoursSince
      });
      
      if (llmDecision?.shouldReachOut && llmDecision.message) {
        message = llmDecision.message;
      }
    } catch {}
  }
  
  // LLM不可用时回退到模板
  if (!message) message = generateProactiveMessage(db, userData, profile, type, reason);
  if (!message) return;
  
  const id = uuid();
  db.prepare("INSERT INTO system_dialogues (id, user_id, dialogue_type, trigger_reason, ai_message, status) VALUES (?, ?, ?, ?, ?, 'pending')").run(id, user.id, type, reason, message);
  db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'assistant', ?)").run(user.id, message);
  saveDb();
  sendToSelf(message).catch(() => {});
}

function generateProactiveMessage(db, user, profile, type, reason) {
  const name = user.username || '主人';
  const today = getToday();
  switch (type) {
    case 'morning': {
      const pending = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'pending'").get(user.id, today);
      return user.consecutive_sign_days > 0
        ? `早安喵~ ☀️ ${name}！连续签到${user.consecutive_sign_days}天！${pending.c > 0 ? `有${pending.c}个任务等着你~` : '要我生成今天的任务吗？'} 💪`
        : `早安喵~ ☀️ ${name}！新的一天，别忘了签到哦~`;
    }
    case 'noon': {
      const c = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(user.id, today);
      return c.c === 0 ? `午间了喵~ 🍱 ${name}，该吃午饭了！顺便看看上午的任务完成了多少？` : null;
    }
    case 'encouragement': {
      const weakest = ['health','finance','learning','career','social','mental','habits','creativity'].map(d => ({ dim: d, val: user['stat_'+d] })).sort((a, b) => a.val - b.val)[0];
      const dimNames = { health:'健康', finance:'财务', learning:'学习', career:'职业', social:'社交', mental:'心理', habits:'习惯', creativity:'创造' };
      return `喵~ ${name}，你的${dimNames[weakest.dim]}属性最近有点低（${weakest.val}分）。要不今天安排一个小任务？~ ❤️`;
    }
    case 'evening': {
      const completed = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(user.id, today);
      const total = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ?").get(user.id, today);
      if (completed.c === total.c && total.c > 0) return `晚安喵~ 🌙 ${name}！今天全部完成，太棒了！好好休息~ ⭐`;
      if (completed.c > 0) return `晚上好喵~ 🌙 ${name}，今天完成了${completed.c}/${total.c}个。明天继续~`;
      return `晚上好喵~ 🌙 ${name}，今天没有完成任务呢。没关系，明天是新的一天！`;
    }
    case 'random': {
      const events = [
        (user.consecutive_sign_days > 0
          ? `喵~ ${name}，连续签到${user.consecutive_sign_days}天了，继续坚持！`
          : `喵~ ${name}，今天还没签到呢，来打个卡吧！✅`),
        `${name}，今天过得怎么样？有没有开心的事想分享？🐱`,
        `嘿${name}~ 记得喝水哦！💧`,
        `${name}，你有想过一年后的自己会是什么样子吗？💭`,
      ];
      return events[Math.floor(Math.random() * events.length)];
    }
    default: return null;
  }
}

async function generateDailyTasks() {
  const db = getWrappedDb();
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) return;
  const today = getToday();
  const existing = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ?").get(user.id, today);
  if (existing.c > 0) return;

  // 尝试用LLM生成个性化任务
  const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
  const stats = { health: user.stat_health, finance: user.stat_finance, learning: user.stat_learning, career: user.stat_career, social: user.stat_social, mental: user.stat_mental, habits: user.stat_habits, creativity: user.stat_creativity };
  const energy = calculateCurrentEnergy(db, user.id);
  const habits = db.prepare("SELECT h.*, (SELECT COUNT(*) FROM habit_logs hl WHERE hl.habit_id = h.id AND date(hl.logged_at) = date('now')) as today_count FROM habits h WHERE h.user_id = ? AND h.is_active = 1").all(user.id).map(h => ({ name: h.name, done: h.today_count > 0 }));
  const goals = db.prepare("SELECT * FROM goals WHERE user_id = ? AND status = 'active' LIMIT 3").all(user.id);
  const recentTasks = db.prepare("SELECT title, status FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 10").all(user.id);

  const llmTasks = await llmPlanTasks(profile, stats, energy, habits, recentTasks, goals);

  if (llmTasks && llmTasks.length > 0) {
    for (const t of llmTasks) {
      const diffMap = { easy: { exp: 10, coins: 5 }, medium: { exp: 20, coins: 10 }, hard: { exp: 40, coins: 20 } };
      const rewards = diffMap[t.difficulty] || diffMap.medium;
      db.prepare("INSERT INTO tasks (id, user_id, dimension_id, title, description, task_type, difficulty, exp_reward, coin_reward, scheduled_date) VALUES (?, ?, ?, ?, ?, 'daily', ?, ?, ?, ?)")
        .run(uuid(), user.id, t.dimension || 'habits', t.title, t.reason || '', t.difficulty || 'medium', rewards.exp, rewards.coins, today);
    }
    addSystemMessage(`🧠 AI已根据你的情况生成了${llmTasks.length}个个性化任务！`);
  } else {
    // LLM不可用时回退到模板
    const allTasks = [
      { dimension: 'health', title: '喝8杯水', desc: '保持身体水分充足', diff: 'easy', exp: 10, coins: 5 },
      { dimension: 'health', title: '运动30分钟', desc: '跑步/健身/散步', diff: 'medium', exp: 20, coins: 10 },
      { dimension: 'learning', title: '学习1小时', desc: '专注学习新知识', diff: 'medium', exp: 20, coins: 10 },
      { dimension: 'habits', title: '今日复盘', desc: '回顾今天的收获', diff: 'easy', exp: 15, coins: 8 },
      { dimension: 'mental', title: '冥想10分钟', desc: '放空大脑，深呼吸', diff: 'easy', exp: 10, coins: 5 },
      { dimension: 'finance', title: '记录今日支出', desc: '记账是理财第一步', diff: 'easy', exp: 10, coins: 5 },
    ];
    const count = 4 + Math.floor(Math.random() * 3);
    const selected = allTasks.sort(() => Math.random() - 0.5).slice(0, count);
    for (const t of selected) {
      db.prepare("INSERT INTO tasks (id, user_id, dimension_id, title, description, task_type, difficulty, exp_reward, coin_reward, scheduled_date) VALUES (?, ?, ?, ?, ?, 'daily', ?, ?, ?, ?)").run(uuid(), user.id, t.dimension, t.title, t.desc, t.diff, t.exp, t.coins, today);
    }
  }
  saveDb();
}

function checkPendingTasks() {
  const db = getWrappedDb();
  const user = db.prepare('SELECT id, username FROM users LIMIT 1').get();
  if (!user) return;
  const today = getToday();
  const pending = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'pending'").get(user.id, today);
  if (pending.c > 0) addSystemMessage(`喵~ ${user.username}，今天还有${pending.c}个任务没完成哦！明天继续加油~ 💪`);
}

function checkInactivity() {
  const db = getWrappedDb();
  const user = db.prepare('SELECT id, username, last_sign_date FROM users LIMIT 1').get();
  if (!user || !user.last_sign_date) return;
  const daysDiff = Math.floor((Date.now() - new Date(user.last_sign_date)) / 86400000);
  if (daysDiff >= 3) addSystemMessage(`喵... ${user.username}，你已经${daysDiff}天没来了... 我很想你 🥺`);
  else if (daysDiff >= 1) addSystemMessage(`${user.username}~ 昨天没见到你呢，今天来吧？🐱`);
}

function triggerDynamicEvent() {
  if (Math.random() > 0.4) return;
  const db = getWrappedDb();
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) return;
  const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
  const event = generateDynamicEvent(db, user, profile);
  if (!event) return;
  const eventId = uuid();
  db.prepare("INSERT INTO story_events (id, title, description, event_type, dimension_id, choices, exp_reward, coin_reward, stat_effects, rarity) VALUES (?, ?, ?, 'dynamic', ?, ?, ?, ?, ?, ?)").run(eventId, event.title, event.description, event.dimension || 'habits', JSON.stringify(event.choices), event.choices[0]?.exp || 10, event.choices[0]?.coins || 5, JSON.stringify(event.choices[0]?.stat_change || {}), event.rarity || 'common');
  addSystemMessage(`🎭 事件触发！\n\n**${event.title}**\n${event.description}\n\n快去事件面板做出选择吧~`);
  saveDb();
}

async function generateDailyReport() {
  const db = getWrappedDb();
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) return;
  const today = getToday();
  const tasks = db.prepare("SELECT * FROM tasks WHERE user_id = ? AND scheduled_date = ?").all(user.id, today);
  const completed = tasks.filter(t => t.status === 'completed').length;
  const checkins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(user.id, today);
  const mood = db.prepare('SELECT AVG(mood_score) as avg FROM mental_mood_diary WHERE user_id = ? AND diary_date = ?').get(user.id, today);
  const energy = calculateCurrentEnergy(db, user.id);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const weekCompletion = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as done FROM tasks WHERE user_id = ? AND scheduled_date >= ?").get(user.id, weekAgo);
  const weakest = ['health','finance','learning','career','social','mental','habits','creativity'].map(d => ({ dim: d, val: user['stat_'+d] })).sort((a, b) => a.val - b.val);

  // 尝试用LLM生成智能复盘
  let summary = `今天完成了${completed}/${tasks.length}个任务。`;
  if (isAiEnabled()) {
    const llmSummary = await llmGenerateReview(
      { completed, total: tasks.length, checkins: checkins.c, mood: mood?.avg || 3, energy },
      { completionRate: weekCompletion.total > 0 ? Math.round(weekCompletion.done / weekCompletion.total * 100) : 0, topDimension: weakest[weakest.length-1]?.dim, weakDimension: weakest[0]?.dim, moodTrend: 'stable' },
      null
    );
    if (llmSummary) summary = llmSummary;
  }

  db.prepare("INSERT OR REPLACE INTO daily_reports (id, user_id, report_date, summary, tasks_completed, tasks_total, exp_gained, coins_gained, highlights, suggestions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(uuid(), user.id, today, summary, completed, tasks.length, completed * 20, completed * 10, '[]', '[]');
  saveDb();
}

function addSystemMessage(text, priority = 'normal') {
  const db = getWrappedDb();
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (!user) return;
  
  // 智能通知检查
  const notifyCheck = shouldNotify(db, user.id, priority);
  if (!notifyCheck.should && priority !== 'urgent') return;

  // 内容去重：同类消息（前 24 字相同）12 小时内只保留一条
  // 否则"恶性循环预警"这类消息会反复插入，把聊天记录刷屏（实测曾占全部消息的 40%）
  const fingerprint = String(text).slice(0, 24);
  const dup = db.prepare(
    "SELECT id FROM chat_history WHERE user_id = ? AND role = 'system' AND substr(content, 1, 24) = ? AND created_at >= datetime('now', '-12 hours') LIMIT 1"
  ).get(user.id, fingerprint);
  if (dup) {
    console.log('系统消息去重跳过: ' + fingerprint);
    return;
  }

  db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'system', ?)").run(user.id, text);
  logNotification(db, user.id, 'system_message', priority, text);
  saveDb();
  pushToFeishu(text).catch(() => {});
  sendToSelf(text).catch(() => {});
}

// ===== 彩票：开奖对奖 =====

function nowBeijingSql() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
}

/** 开奖后自动对奖并主动提醒（按 期号+玩法 去重，同一天多次跑不会重复提醒） */
async function runLotteryCheck(tag = '') {
  try {
    const db = getWrappedDb();
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (!user) return;

    const today = getToday();
    const dow = new Date(today + 'T00:00:00Z').getUTCDay();
    const games = Object.keys(GAMES).filter((g) => GAMES[g].drawDays.includes(dow));
    if (!games.length) return;

    // 拉最新开奖
    for (const game of games) {
      try { await syncDraws(db, game, 10); } catch (e) { console.error(`[彩票] ${game} 开奖同步失败:`, e.message); }
    }
    resolvePendingIssues(db, user.id);
    backfillDrawDates(db, user.id);

    for (const game of games) {
      const latest = db.prepare('SELECT * FROM lottery_draws WHERE game = ? ORDER BY issue DESC LIMIT 1').get(game);
      if (!latest) continue;
      if (latest.draw_date !== today) continue; // 只处理今天开的这一期

      const already = db.prepare(
        "SELECT id FROM lottery_notices WHERE user_id = ? AND game = ? AND issue = ? AND kind = 'result' LIMIT 1"
      ).get(user.id, game, latest.issue);
      if (already) continue;

      const rows = db.prepare('SELECT * FROM lottery_tickets WHERE user_id = ? AND game = ? AND issue = ?').all(user.id, game, latest.issue);
      if (!rows.length) continue;

      const results = [];
      for (const t of rows) {
        const r = checkTicket(db, t, { persist: true });
        if (r) results.push(r);
      }
      if (!results.length) continue;

      const wonCount = results.filter((r) => r.prize > 0).length;
      const totalPrize = results.filter((r) => r.prize > 0).reduce((s, r) => s + r.prize, 0);
      let msg = buildResultMessage(results, GAMES[game].name);
      msg += `\n📊 第 ${latest.issue} 期开奖号：${[...latest.numbers.main, ...latest.numbers.extra].map((n) => String(n).padStart(2, '0')).join(' ')}`;

      addSystemMessage(msg, wonCount > 0 ? 'urgent' : 'normal');
      db.prepare(`
        INSERT INTO lottery_notices (user_id, ticket_id, game, issue, kind, content, created_at)
        VALUES (?, NULL, ?, ?, 'result', ?, ?)
      `).run(user.id, game, latest.issue, msg, nowBeijingSql());
      console.log(`[彩票] ${tag} ${GAMES[game].name} ${latest.issue} 期对奖：${results.length} 注，中 ${wonCount} 注，${totalPrize} 元`);
    }
  } catch (e) {
    console.error('[彩票] 对奖任务失败:', e.message);
  }
}

/** 开奖日提醒买票（只提醒一次，且当天还没记录该玩法） */
function remindLotteryBuy() {
  try {
    const db = getWrappedDb();
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (!user) return;

    const total = db.prepare('SELECT COUNT(*) AS c FROM lottery_tickets WHERE user_id = ?').get(user.id).c;
    if (total < 3) return; // 还没形成习惯就不打扰

    const today = getToday();
    const dow = new Date(today + 'T00:00:00Z').getUTCDay();
    const games = Object.keys(GAMES).filter((g) => GAMES[g].drawDays.includes(dow));
    if (!games.length) return;

    const missing = games.filter((g) => {
      const n = db.prepare('SELECT COUNT(*) AS c FROM lottery_tickets WHERE user_id = ? AND game = ? AND bet_date = ?').get(user.id, g, today).c;
      return n === 0;
    });
    if (!missing.length) return;

    const names = missing.map((g) => GAMES[g].short).join('、');
    addSystemMessage(`🎟️ 今晚 ${names} 开奖，买了记得拍照发我，开奖后我帮你对号。`, 'normal');
  } catch (e) {
    console.error('[彩票] 买票提醒失败:', e.message);
  }
}

function catGainExp(amount, reason) {  const db = getWrappedDb();
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (!user) return;
  let cat = db.prepare('SELECT * FROM cat_growth WHERE user_id = ?').get(user.id);
  if (!cat) {
    const id = uuid();
    db.prepare("INSERT INTO cat_growth (id, user_id, first_meet_date) VALUES (?, ?, date('now'))").run(id, user.id);
    cat = { id, cat_level: 1, cat_exp: 0 };
  }
  let newExp = cat.cat_exp + amount;
  let newLevel = cat.cat_level;
  while (newExp >= Math.floor(50 * Math.pow(1.2, newLevel))) {
    newExp -= Math.floor(50 * Math.pow(1.2, newLevel));
    newLevel++;
  }
  db.prepare("UPDATE cat_growth SET cat_level = ?, cat_exp = ?, total_interactions = total_interactions + 1, last_interaction = datetime('now') WHERE id = ?").run(newLevel, newExp, cat.id);
  saveDb();
}

async function generateWeeklyPlan() {
  const db = getWrappedDb();
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) return;
  const today = new Date();
  const todayDate = new Date();
  const weekStart = new Date(todayDate.getTime() - todayDate.getDay() * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const weekEnd = new Date(todayDate.getTime() + (6 - todayDate.getDay()) * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  const existing = db.prepare("SELECT id FROM periodic_plans WHERE user_id = ? AND plan_type = 'weekly' AND period_start = ?").get(user.id, weekStart);
  if (existing) return;
  const weakest = ['health','finance','learning','career','social','mental','habits','creativity'].map(d => ({ dim: d, val: user['stat_'+d] })).sort((a, b) => a.val - b.val).slice(0, 3);
  const goals = weakest.map(w => ({ dimension: w.dim, title: `${w.dim}提升周`, description: `本周重点提升${w.dim}`, target_count: 5 }));
  db.prepare("INSERT INTO periodic_plans (id, user_id, plan_type, period_start, period_end, goals) VALUES (?, ?, 'weekly', ?, ?, ?)").run(uuid(), user.id, weekStart, weekEnd, JSON.stringify(goals));
  addSystemMessage('📅 新的一周！本周计划已生成，重点关注：' + weakest.map(w => w.dim).join('、'));
  saveDb();
}

async function checkWeatherAndAdjust() {
  try {
    const db = getWrappedDb();
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT city FROM life_profile WHERE user_id = ?').get(user?.id);
    if (!profile?.city) return;
    const response = await fetch(`https://wttr.in/${encodeURIComponent(profile.city)}?format=j1`, { signal: AbortSignal.timeout(5000) });
    const data = await response.json();
    const current = data.current_condition?.[0];
    if (!current) return;
    const temp = parseInt(current.temp_C || '20');
    const isRainy = parseInt(current.rainMM || '0') > 0 || current.weatherDesc?.[0]?.value?.includes('rain');
    if (isRainy) addSystemMessage(`🌧️ ${profile.city}今天下雨了~ 记得带伞！`);
    else if (temp < 5) addSystemMessage(`❄️ ${profile.city}今天好冷（${temp}°C）~ 注意保暖！`);
    else if (temp > 35) addSystemMessage(`🔥 ${profile.city}今天好热（${temp}°C）~ 注意防暑！`);
  } catch {}
}

function autoGenerateNarrative() {
  const db = getWrappedDb();
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (!user) return;
  // 只在有足够数据时生成
  const checkinDays = db.prepare('SELECT COUNT(DISTINCT date(checked_at)) as c FROM check_ins WHERE user_id = ?').get(user.id);
  if (checkinDays.c < 3) return;
  // 调用叙事API
  generateNarrative(db, user.id).catch(() => {});
  addSystemMessage('📖 新的人生故事章节已生成！去看看吧~');
}

// 惊喜机制
function triggerSurprise() {
  if (Math.random() > 0.3) return; // 30%概率
  
  const db = getWrappedDb();
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) return;
  
  const surprises = [
    { type: 'bonus', message: `🎁 惊喜！猫猫侠给你送了${5 + Math.floor(Math.random() * 20)}金币！`, action: () => {
      const bonus = 5 + Math.floor(Math.random() * 20);
      db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(bonus, user.id);
      return bonus;
    }},
    { type: 'encouragement', message: `🌟 猫猫侠想对你说：你比你想象的更强大！连续签到${user.consecutive_sign_days}天，这需要真正的毅力。`, action: () => {} },
    { type: 'fact', message: getCatFact(), action: () => {} },
    { type: 'challenge', message: `🐱 猫猫侠挑战你：今天完成所有任务，奖励双倍经验！`, action: () => {
      db.prepare("UPDATE tasks SET exp_reward = exp_reward * 2 WHERE user_id = ? AND scheduled_date = date('now') AND status = 'pending'").run(user.id);
    }},
  ];
  
  const surprise = surprises[Math.floor(Math.random() * surprises.length)];
  surprise.action();
  addSystemMessage(surprise.message);
}

function getCatFact() {
  const facts = [
    '🐱 你知道吗？猫每天睡12-16小时，所以下次偷懒也可以说是学猫~',
    '🐱 猫的呼噜声有治愈效果，和我聊天也一样哦~',
    '🐱 猫可以看到人类看不到的东西...比如你的潜力！',
    '🐱 猫从高处落下总是四脚着地，你也要学会在生活中稳稳落地~',
    '🐱 猫有230块骨头，比人类多24块。所以你比猫少一些"骨气"，要多努力哦~',
    '🐱 猫的记忆力可以长达10年，我也一样会记住你说过的每句话~',
  ];
  return facts[Math.floor(Math.random() * facts.length)];
}
