// 猫猫侠 智能通知系统 - 活跃模式学习、优先级分层、效果反馈
import { v4 as uuid } from 'uuid';

// 学习用户活跃模式
export function learnActivityPattern(db, userId) {
  const logs = db.prepare(`SELECT * FROM notification_log WHERE user_id = ? AND opened_at IS NOT NULL ORDER BY sent_at DESC LIMIT 200`).all(userId);

  const patterns = {};
  for (const log of logs) {
    const sent = new Date(log.sent_at);
    const hour = sent.getHours();
    const dow = sent.getDay();
    const key = `${dow}_${hour}`;

    if (!patterns[key]) patterns[key] = { opens: 0, responses: 0, total: 0 };
    patterns[key].total++;
    if (log.opened_at) patterns[key].opens++;
    if (log.responded_at) patterns[key].responses++;
  }

  for (const [key, data] of Object.entries(patterns)) {
    const [dow, hour] = key.split('_').map(Number);
    const openRate = data.opens / data.total;
    const responseRate = data.responses / data.total;

    db.prepare(`INSERT OR REPLACE INTO notification_patterns (user_id, hour, day_of_week, open_rate, response_rate, sample_count, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`)
      .run(userId, hour, dow, openRate, responseRate, data.total);
  }
}

// 判断是否应该推送
export function shouldNotify(db, userId, priority = 'normal') {
  const now = new Date();
  const hour = now.getHours();
  const dow = now.getDay();

  // P0紧急: 始终推送
  if (priority === 'urgent') return { should: true, reason: 'urgent' };

  // 深夜不推送 (23:00 - 7:00)
  if (hour >= 23 || hour < 7) {
    if (priority !== 'urgent') return { should: false, reason: 'quiet_hours' };
  }

  // 查看该时段的历史打开率
  const pattern = db.prepare('SELECT * FROM notification_patterns WHERE user_id = ? AND hour = ? AND day_of_week = ?').get(userId, hour, dow);

  if (pattern && pattern.sample_count >= 5) {
    // 低打开率时段不推普通消息
    if (pattern.open_rate < 0.2 && priority === 'normal') {
      return { should: false, reason: 'low_engagement_time' };
    }
    // 高打开率时段优先推
    if (pattern.open_rate > 0.6) {
      return { should: true, reason: 'golden_hour' };
    }
  }

  // P1重要: 活跃时段推送
  if (priority === 'important') {
    const activeHours = db.prepare('SELECT hour FROM notification_patterns WHERE user_id = ? AND open_rate > 0.4 ORDER BY open_rate DESC LIMIT 6').all(userId);
    const activeHourSet = new Set(activeHours.map(h => h.hour));
    if (!activeHourSet.has(hour)) return { should: false, reason: 'wait_for_active_time' };
  }

  return { should: true, reason: 'ok' };
}

// 记录通知
export function logNotification(db, userId, type, priority, content, channel = 'system') {
  const id = uuid();
  db.prepare('INSERT INTO notification_log (id, user_id, notification_type, priority, content, channel) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, userId, type, priority, content, channel);
  return id;
}

// 标记通知打开
export function markOpened(db, notificationId) {
  db.prepare('UPDATE notification_log SET opened_at = datetime("now") WHERE id = ?').run(notificationId);
}

// 标记通知回复
export function markResponded(db, notificationId) {
  db.prepare('UPDATE notification_log SET responded_at = datetime("now") WHERE id = ?').run(notificationId);
}

// 获取通知统计
export function getNotificationStats(db, userId) {
  const total = db.prepare('SELECT COUNT(*) as c FROM notification_log WHERE user_id = ?').get(userId).c;
  const opened = db.prepare('SELECT COUNT(*) as c FROM notification_log WHERE user_id = ? AND opened_at IS NOT NULL').get(userId).c;
  const responded = db.prepare('SELECT COUNT(*) as c FROM notification_log WHERE user_id = ? AND responded_at IS NOT NULL').get(userId).c;

  const byType = db.prepare(`SELECT notification_type, COUNT(*) as total, SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened FROM notification_log WHERE user_id = ? GROUP BY notification_type`).all(userId);

  return {
    total, opened, responded,
    openRate: total > 0 ? Math.round(opened / total * 100) : 0,
    responseRate: total > 0 ? Math.round(responded / total * 100) : 0,
    byType
  };
}

// 获取最佳推送时间
export function getBestNotificationTimes(db, userId) {
  return db.prepare('SELECT hour, day_of_week, open_rate, response_rate FROM notification_patterns WHERE user_id = ? AND sample_count >= 3 ORDER BY open_rate DESC LIMIT 10').all(userId);
}
