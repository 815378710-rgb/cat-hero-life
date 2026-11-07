// 统一消息闸门 — 防止洪泛、时间错乱、重复主题
// 所有主动消息必须经过此闸门才能发送
import { getDb } from '../db/init.js';

const GATE_RULES = {
  // 每条消息类型的冷却时间（毫秒）
  cooldowns: {
    nighttime_concern: 4 * 3600_000,   // 夜晚关怀：4小时
    morning_greeting: 4 * 3600_000,     // 早间问候：4小时
    health_reminder: 3 * 3600_000,      // 健康提醒：3小时
    financial_alert: 4 * 3600_000,      // 财务提醒：4小时
    reflection: 3 * 3600_000,           // 反思消息：3小时
    milestone: 6 * 3600_000,            // 里程碑：6小时
    general_checkin: 2 * 3600_000,      // 一般问候：2小时
    daily_report: 24 * 3600_000,        // 日报：1天
  },

  // 全局限制（跨所有类型）
  global: {
    minInterval: 60 * 60_000,          // 最短间隔：1小时
    maxPerDay: 8,                       // 每天最多8条
    quietStart: 23,                     // 静默开始：23点
    quietEnd: 7,                        // 静默结束：7点
  },
};

let lastSentTime = 0;
let lastSentType = null;
let dailyCount = 0;
let dailyCountDate = null;

// 确定消息类型
function classifyMessage(message) {
  const m = message.toLowerCase();
  if (m.includes('晚安') || m.includes('夜') || m.includes('睡不着') || m.includes('睡') || m.includes('灯') || m.includes('守着你')) return 'nighttime_concern';
  if (m.includes('早上') || m.includes('早安') || m.includes('醒') || m.includes('天亮了') || m.includes('起床')) return 'morning_greeting';
  if (m.includes('打卡') || m.includes('任务') || m.includes('加油')) return 'general_checkin';
  if (m.includes('水分') || m.includes('喝') || m.includes('运动') || m.includes('身体') || m.includes('睡眠')) return 'health_reminder';
  if (m.includes('支出') || m.includes('消费') || m.includes('财务') || m.includes('理财') || m.includes('钱')) return 'financial_alert';
  if (m.includes('报告') || m.includes('数据') || m.includes('统计') || m.includes('分析')) return 'daily_report';
  if (m.includes('里程碑') || m.includes('解锁') || m.includes('连签') || m.includes('打破')) return 'milestone';
  if (m.includes('反思') || m.includes('想想') || m.includes('回顾')) return 'reflection';
  return 'general_checkin';
}

// 获取亚洲时间
function getNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
}

// 判断是否在静默时段
function isQuietHours() {
  const h = getNow().getHours();
  return h >= GATE_RULES.global.quietStart || h < GATE_RULES.global.quietEnd;
}

// 检查主题重复（去重）
function isThemeDuplicate(db, message, userId) {
  const keywords = extractKeywords(message);
  if (!keywords) return false;

  const recent = db.prepare(
    "SELECT message FROM pending_wechat_msgs WHERE user_id = ? AND created_at >= datetime('now', '-2 hours') ORDER BY created_at DESC LIMIT 5"
  ).all(userId);

  for (const row of recent) {
    if (!row.message) continue;
    const kw = extractKeywords(row.message);
    if (!kw) continue;
    // 如果两个消息共享至少 2 个关键词 → 重复
    const overlap = keywords.filter(k => kw.includes(k)).length;
    if (overlap >= 2) return true;
  }
  return false;
}

function extractKeywords(message) {
  const stopWords = ['的','了','在','是','我','你','他','她','它','们','有','和','都','很','也','就','会','不','能','要','去','对','着','把','被','给','让','来','没','看','说','自己','一个','这个','那个','什么','怎么','可以','不是'];
  return (message || '').replace(/[！。，？、~～🐱😴🌙⭐💤🌅☀️🔋📊💡🏥💰⏰🤖\n\s]/g, ' ')
    .split(' ')
    .filter(w => w.length >= 2 && !stopWords.includes(w));
}

// 检查每日限额
function checkDailyLimit() {
  const today = getNow().toLocaleDateString('zh-CN');
  if (dailyCountDate !== today) {
    dailyCountDate = today;
    dailyCount = 0;
  }
  if (dailyCount >= GATE_RULES.global.maxPerDay) return false;
  return true;
}

// ===== 主闸门 =====
export function canSend(db, userId, message, sender) {
  const now = Date.now();
  const type = classifyMessage(message);

  // 1. 静默时段：只允许紧急消息通过
  if (isQuietHours() && type !== 'nighttime_concern') {
    // 夜间只允许夜晚关怀（还必须在 23-1 点之间）
    if (type === 'nighttime_concern') {
      const h = getNow().getHours();
      if (h > 1 && h < 7) return { pass: false, reason: '深夜静默(1-7点)' };
    } else {
      return { pass: false, reason: '静默时段，非紧急消息已拦截' };
    }
  }

  // 2. 全局最小间隔
  if (lastSentTime > 0 && now - lastSentTime < GATE_RULES.global.minInterval) {
    return { pass: false, reason: `距上次发送仅${Math.round((now-lastSentTime)/60000)}分钟，需≥60分钟` };
  }

  // 3. 同类型冷却
  if (lastSentType === type && lastSentTime > 0) {
    const cooldown = GATE_RULES.cooldowns[type] || 7200000;
    if (now - lastSentTime < cooldown) {
      return { pass: false, reason: `${type} 类型冷却中` };
    }
  }

  // 4. 每日限额
  if (!checkDailyLimit()) {
    return { pass: false, reason: '今日已达最大发送量(8条)' };
  }

  // 5. 主题去重
  if (isThemeDuplicate(db, message, userId)) {
    return { pass: false, reason: '主题重复，2小时内已发送过类似消息' };
  }

  // 6. 时间合理性检查
  const h = getNow().getHours();
  const timeSanity = checkTimeSanity(type, h);
  if (!timeSanity.pass) return timeSanity;

  return { pass: true };
}

function checkTimeSanity(type, hour) {
  // 早间问候只能在 6-11 点
  if (type === 'morning_greeting' && (hour < 6 || hour > 11)) {
    return { pass: false, reason: '早间问候只在6-11点发送' };
  }
  // 夜晚关怀只能在 21-2 点
  if (type === 'nighttime_concern' && hour < 21 && hour >= 7) {
    return { pass: false, reason: '夜晚关怀只在21点后发送' };
  }
  return { pass: true };
}

// 通过闸门后记录
export function recordSent(message) {
  const type = classifyMessage(message);
  lastSentTime = Date.now();
  lastSentType = type;
  dailyCount++;
}

// 重置闸门状态（用于测试/调试）
export function resetGate() {
  lastSentTime = 0;
  lastSentType = null;
  dailyCount = 0;
  dailyCountDate = null;
}

// 对外暴露状态
export function getGateStatus() {
  return {
    lastSentTime: lastSentTime ? new Date(lastSentTime).toISOString() : null,
    lastSentType,
    dailyCount,
    dailyCountDate,
    quiet: isQuietHours(),
  };
}
