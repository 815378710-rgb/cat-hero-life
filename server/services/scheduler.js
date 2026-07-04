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
import { learnEnergyBaseline } from './energy-model.js';
import { learnWeightsFromData, detectFeedbackCycles } from './neural-engine.js';
import { getPendingChecks, checkDecisionOutcome } from './decision-tracker.js';
import { checkTitleUnlocks } from './gamification-deep.js';
import { shouldNotify, logNotification, learnActivityPattern } from './smart-notifications.js';

function getWrappedDb() { return createDbWrapper(getDb()); }

export function startScheduler() {
  console.log('⏰ 定时任务调度器启动');

  // 7:30 早安 + 任务生成
  cron.schedule('30 7 * * *', () => {
    generateDailyTasks();
    triggerDialogue('morning', '每日早安');
  }, { timezone: 'Asia/Shanghai' });

  // 8:00 天气检查
  cron.schedule('0 8 * * *', () => { checkWeatherAndAdjust(); }, { timezone: 'Asia/Shanghai' });

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
}

function triggerDialogue(type, reason) {
  const db = getWrappedDb();
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (!user) return;
  const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
  const userData = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  const message = generateProactiveMessage(db, userData, profile, type, reason);
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
        `喵~ ${name}，连续签到${user.consecutive_sign_days}天了，继续坚持！`,
        `${name}，今天过得怎么样？有没有开心的事想分享？🐱`,
        `嘿${name}~ 记得喝水哦！💧`,
        `${name}，你有想过一年后的自己会是什么样子吗？💭`,
      ];
      return events[Math.floor(Math.random() * events.length)];
    }
    default: return null;
  }
}

function generateDailyTasks() {
  const db = getWrappedDb();
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) return;
  const today = getToday();
  const existing = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ?").get(user.id, today);
  if (existing.c > 0) return;
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

function generateDailyReport() {
  const db = getWrappedDb();
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (!user) return;
  const today = getToday();
  const tasks = db.prepare("SELECT * FROM tasks WHERE user_id = ? AND scheduled_date = ?").all(user.id, today);
  const completed = tasks.filter(t => t.status === 'completed').length;
  db.prepare("INSERT OR REPLACE INTO daily_reports (id, user_id, report_date, summary, tasks_completed, tasks_total, exp_gained, coins_gained, highlights, suggestions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(uuid(), user.id, today, `今天完成了${completed}/${tasks.length}个任务。`, completed, tasks.length, completed * 20, completed * 10, '[]', '[]');
  saveDb();
}

function addSystemMessage(text, priority = 'normal') {
  const db = getWrappedDb();
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (!user) return;
  
  // 智能通知检查
  const notifyCheck = shouldNotify(db, user.id, priority);
  if (!notifyCheck.should && priority !== 'urgent') return;
  
  db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'system', ?)").run(user.id, text);
  logNotification(db, user.id, 'system_message', priority, text);
  saveDb();
  pushToFeishu(text).catch(() => {});
  sendToSelf(text).catch(() => {});
}

function catGainExp(amount, reason) {
  const db = getWrappedDb();
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
