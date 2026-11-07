// 主动触发引擎 — 让系统不再是"你问我才答"
// 基于时间、数据变化、用户状态主动发起对话
import { getDb } from '../db/init.js';
import { canSend, recordSent } from './message-gate.js';

// ===== 触发器配置 =====
const TRIGGERS = {
  // 时间触发器
  morning_greeting: { hour: 8, minute: 0, lastFire: null, cooldownMs: 24 * 3600_000 },
  evening_review:  { hour: 21, minute: 0, lastFire: null, cooldownMs: 24 * 3600_000 },
  lunch_break:     { hour: 12, minute: 30, lastFire: null, cooldownMs: 24 * 3600_000 },
  weekend_plan:    { weekday: 5, hour: 16, minute: 0, lastFire: null, cooldownMs: 7 * 24 * 3600_000 }, // 周五下午
  weekly_report:   { weekday: 0, hour: 20, minute: 0, lastFire: null, cooldownMs: 7 * 24 * 3600_000 }, // 周日晚8点

  // 数据触发器
  streak_milestone:    { lastMilestone: 0, check: true },    // 连续打卡里程碑
  low_activity:        { thresholdHours: 6, check: true },    // 长时间未活跃
  financial_alert:     { thresholdPercent: 15, check: true }, // 财务大幅变动
  health_decline:      { thresholdDays: 3, check: true },     // 运动/睡眠连续下滑
  goal_progress_check: { check: true },                       // 目标进度检查
};

let checkInterval = null;

// ===== 触发消息模板 =====
function buildProactiveMessage(type, context) {
  const user = context.user || {};
  const name = user.username || '主人';
  
  const messages = {
    morning_greeting: [
      `${name}早上好！新的一天开始了 ☀️ 今天有什么计划？`,
      `早啊 ${name}，昨晚睡得好吗？今天要加油哦`,
      `${name}早！今天的任务已经帮你准备好了，要看看吗？`,
    ],
    evening_review: [
      `${name}，一天快结束了 🌙 今天过得怎么样？完成了哪些事？`,
      `${name}，该复盘今天了——今天最有成就感的一件事是什么？`,
      `晚上好 ${name}！今天有什么让你开心的瞬间吗？`,
    ],
    lunch_break: [
      `${name}中午好，记得吃饭哦~ 上午完成了什么？`,
    ],
    weekend_plan: [
      `${name}，马上周末了！这周末有什么安排吗？`,
    ],
    weekly_report: [
      `📊 ${name}，本周复盘时间到！要帮你生成一份周报看看这周的表现吗？`,
    ],
    streak_milestone: [
      `🎉 ${name}！你已经连续打卡${context.streak}天了！太厉害了！`,
    ],
    low_activity: [
      `${name}，好一阵子没和你聊天了，最近怎么样？`,
      `${name}在忙吗？别忘了照顾好自己哦`,
    ],
    financial_alert: [
      `${name}，我注意到你最近${context.financialContext || '财务状况有变化'}，要聊聊吗？`,
    ],
    health_decline: [
      `${name}，你最近${context.days || '几天'}没运动了哦，身体是革命的本钱~`,
      `${name}，最近睡眠质量好吗？我看数据有点下降`,
    ],
    goal_progress_check: [
      `${name}，你的目标「${context.goalTitle || ''}」进展如何了？`,
    ],
  };

  const pool = messages[type] || [`${name}，我有点想你了~`];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ===== 检查逻辑 =====

function getNowInAsia() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
}

function shouldFire(trigger, now) {
  if (!trigger.lastFire) return true;
  const elapsed = now.getTime() - trigger.lastFire.getTime();
  return elapsed >= trigger.cooldownMs;
}

function isWithinTimeWindow(trigger, now) {
  const h = now.getHours();
  const m = now.getMinutes();
  const d = now.getDay();

  // 精确分钟级触发（前后1分钟内）
  if (trigger.hour !== undefined && trigger.minute !== undefined) {
    if (trigger.weekday !== undefined && trigger.weekday !== d) return false;
    return h === trigger.hour && m >= trigger.minute && m <= trigger.minute + 1;
  }

  return false;
}

// ===== 主检查循环 =====

let lastCheckMinute = -1;

export function startProactiveEngine() {
  if (checkInterval) return;

  console.log('Proactive engine started (checks every 60s)');

  checkInterval = setInterval(async () => {
    const now = getNowInAsia();

    // 同一分钟内不要重复检查
    if (now.getMinutes() === lastCheckMinute) return;
    lastCheckMinute = now.getMinutes();

    try {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users LIMIT 1').get();
      if (!user) return;

      await checkTimeTriggers(db, user, now);
      await checkDataTriggers(db, user, now);
    } catch (e) {
      console.error('Proactive engine error:', e.message);
    }
  }, 60_000);
}

async function checkTimeTriggers(db, user, now) {
  const triggers = ['morning_greeting', 'evening_review', 'lunch_break', 'weekend_plan', 'weekly_report'];
  
  for (const key of triggers) {
    const t = TRIGGERS[key];
    if (!isWithinTimeWindow(t, now)) continue;
    if (!shouldFire(t, now)) continue;

    t.lastFire = now;

    // 检查用户最近是否活跃（刚聊过就别烦人）
    const lastChat = db.prepare(
      "SELECT created_at FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get(user.id);
    if (lastChat) {
      const lastTime = new Date(lastChat.created_at + 'Z').getTime();
      const minutesSinceLastChat = (now.getTime() - lastTime) / 60_000;
      // 如果10分钟内刚聊过，跳过
      if (minutesSinceLastChat < 10) continue;
    }

    const message = buildProactiveMessage(key, { user });
    queueProactiveMessage(db, user.id, message, key);
  }
}

async function checkDataTriggers(db, user, now) {
  // 检查签到里程碑
  const streak = db.prepare(
    "SELECT consecutive_sign_days FROM users WHERE id = ?"
  ).get(user.id)?.consecutive_sign_days || 0;

  const milestones = [3, 7, 14, 21, 30, 50, 60, 100];
  for (const m of milestones) {
    if (streak === m && TRIGGERS.streak_milestone.lastMilestone < m) {
      TRIGGERS.streak_milestone.lastMilestone = m;
      const message = buildProactiveMessage('streak_milestone', { user, streak });
      queueProactiveMessage(db, user.id, message, 'streak_milestone');
      break;
    }
  }

  // 检查长期未活跃（6小时没消息）
  const lastChat = db.prepare(
    "SELECT created_at FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(user.id);
  if (lastChat) {
    const hoursSinceLastChat = (now.getTime() - new Date(lastChat.created_at + 'Z').getTime()) / 3600_000;
    if (hoursSinceLastChat >= TRIGGERS.low_activity.thresholdHours) {
      // 只在白天（8-22点）触发
      const hour = now.getHours();
      if (hour >= 8 && hour <= 22 && shouldFire({ lastFire: TRIGGERS.low_activity.lastFire, cooldownMs: 6 * 3600_000 }, now)) {
        TRIGGERS.low_activity.lastFire = now;
        const message = buildProactiveMessage('low_activity', { user });
        queueProactiveMessage(db, user.id, message, 'low_activity');
      }
    }
  }

  // 检查目标进度（每天一次）
  if (shouldFire({ lastFire: TRIGGERS.goal_progress_check.lastFire, cooldownMs: 24 * 3600_000 }, now)) {
    TRIGGERS.goal_progress_check.lastFire = now;
    const goal = db.prepare(
      "SELECT title FROM goals WHERE user_id = ? AND deadline > date('now') ORDER BY priority DESC LIMIT 1"
    ).get(user.id);
    if (goal) {
      const message = buildProactiveMessage('goal_progress_check', { user, goalTitle: goal.title });
      queueProactiveMessage(db, user.id, message, 'goal_progress_check');
    }
  }
}

// ===== 消息队列（经闸门检查） =====
function queueProactiveMessage(db, userId, message, triggerType) {
  try {
    // 闸门检查
    const gate = canSend(db, userId, message, 'proactive');
    if (!gate.pass) {
      console.log(`Proactive [${triggerType}] 🚫 ${gate.reason}: ${message.slice(0, 40)}`);
      return;
    }
    
    // 写入待发送队列（不用metadata列，避免不存在）
    db.prepare(
      "INSERT INTO pending_wechat_msgs (id, user_id, message, status, created_at) VALUES (?, ?, ?, 'pending', datetime('now'))"
    ).run(
      Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      userId,
      message
    );

    recordSent(message);
    console.log(`Proactive [${triggerType}]: ${message.slice(0, 60)}`);
  } catch (e) {
    console.error('queueProactiveMessage:', e.message);
  }
}

// ===== 获取主动推送状态 =====

export function getProactiveStatus() {
  const status = {};
  for (const [key, trigger] of Object.entries(TRIGGERS)) {
    status[key] = {
      lastFired: trigger.lastFire ? trigger.lastFire.toISOString() : null,
      cooldownMs: trigger.cooldownMs || null,
    };
  }
  return status;
}

export function stopProactiveEngine() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
