// 猫猫侠 智能提醒服务 - 基于真实用户状态的主动提醒
import cron from 'node-cron';

function getToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function getYesterday() {
  const d = new Date(Date.now() - 86400000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

async function sendToWechat(message) {
  try {
    await fetch('http://127.0.0.1:3000/api/wechat-bot/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
  } catch (e) {
    console.error('智能提醒推送失败:', e.message);
  }
}

/**
 * 注册所有智能提醒定时任务
 * @param {Object} db - 数据库wrapper
 */
export function initSmartReminders(db) {
  const user = () => db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user()) return;

  console.log('🤖 智能提醒服务已启动');

  // 8:00 AM - 检查昨是否打了卡
  cron.schedule('0 8 * * *', () => {
    const today = getToday();
    const yesterday = getYesterday();
    const u = user();
    if (!u) return;

    const yesterdayCheckin = db.prepare(
      'SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?'
    ).get(u.id, yesterday);

    if (!yesterdayCheckin || yesterdayCheckin.c === 0) {
      sendToWechat('老大昨晚没打卡哦~今天加油！');
    }
  }, { timezone: 'Asia/Shanghai' });

  // 10:00 AM - 检查今日是否有完成任务
  cron.schedule('0 10 * * *', () => {
    const today = getToday();
    const u = user();
    if (!u) return;

    const completed = db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'"
    ).get(u.id, today);

    if (!completed || completed.c === 0) {
      const pending = db.prepare(
        "SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'pending'"
      ).get(u.id, today);

      if (pending && pending.c > 0) {
        sendToWechat(`上午快过半了，挑一个任务开始吧！还有${pending.c}个任务等着你~ ⏰`);
      }
    }
  }, { timezone: 'Asia/Shanghai' });

  // 2:00 PM - 午后检查提醒（带当前数据）
  cron.schedule('0 14 * * *', () => {
    const today = getToday();
    const u = user();
    if (!u) return;

    const checkins = db.prepare(
      'SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?'
    ).get(u.id, today);

    const completed = db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'"
    ).get(u.id, today);

    const total = db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ?"
    ).get(u.id, today);

    const stats = [
      `📍 打卡${checkins?.c || 0}次`,
      `✅ 完成任务${completed?.c || 0}/${total?.c || 0}个`,
      `🔥 连续签到${u.consecutive_sign_days}天`,
    ].join(' | ');

    sendToWechat(`午后快速检查：${stats}\n加油，下午还可以完成更多！💪`);
  }, { timezone: 'Asia/Shanghai' });

  // 5:00 PM - 财务摘要（如果今日支出超过收入）
  cron.schedule('0 17 * * *', () => {
    const today = getToday();
    const u = user();
    if (!u) return;

    try {
      const finance = db.prepare(
        'SELECT * FROM finance_stats WHERE user_id = ? AND date = ?'
      ).get(u.id, today);

      if (finance && finance.today_expense > 0) {
        if (finance.today_income === 0 || finance.today_expense > finance.today_income) {
          const diff = (finance.today_expense - (finance.today_income || 0)).toFixed(2);
          sendToWechat(
            `💰 财务提醒：今日支出${finance.today_expense.toFixed(2)}元` +
            (finance.today_income > 0 ? `，收入${finance.today_income.toFixed(2)}元` : '，暂无收入') +
            `\n${finance.today_income === 0 ? '今天还没入账哦～' : `超出${diff}元，留意消费节奏~`}`
          );
        }
      }
    } catch (e) { /* 忽略财务表错误 */ }
  }, { timezone: 'Asia/Shanghai' });

  // 9:00 PM - 晚间鼓励 + 进度摘要
  cron.schedule('0 21 * * *', () => {
    const today = getToday();
    const u = user();
    if (!u) return;

    const completed = db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'"
    ).get(u.id, today);

    const total = db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ?"
    ).get(u.id, today);

    const checkins = db.prepare(
      'SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?'
    ).get(u.id, today);

    const totalCompleted = completed?.c || 0;
    const totalTasks = total?.c || 0;
    const totalCheckins = checkins?.c || 0;

    if (totalCompleted === totalTasks && totalTasks > 0) {
      sendToWechat(`🌙 晚上好！今天全部完成，太棒了！\n✅ ${totalCompleted}个任务 | 📍 ${totalCheckins}次打卡\n好好休息，明天继续冲~ ⭐`);
    } else if (totalCompleted > 0) {
      const remaining = totalTasks - totalCompleted;
      sendToWechat(`🌙 晚上好！今天完成了${totalCompleted}/${totalTasks}个任务\n还剩${remaining}个，看看能不能再完成一个？💪`);
    } else if (totalTasks > 0) {
      sendToWechat(`🌙 晚上好！今天还没完成任务\n还有时间，挑最简单的那个先做了！`);
    } else {
      sendToWechat(`🌙 晚上好！今天打卡${totalCheckins}次，连续签到${u.consecutive_sign_days}天\n别忘了回顾今天的收获哦~`);
    }
  }, { timezone: 'Asia/Shanghai' });

  // 11:00 PM - 任务未完成时温和提醒
  cron.schedule('0 23 * * *', () => {
    const today = getToday();
    const u = user();
    if (!u) return;

    const pending = db.prepare(
      "SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'pending'"
    ).get(u.id, today);

    if (pending && pending.c > 0) {
      const msg = pending.c === 1
        ? '夜深了~ 还有1个任务没完成哦。别太勉强，明天早点来！🌙'
        : `夜深了~ 还有${pending.c}个任务没完成。没关系，明天继续加油！🌙`;

      sendToWechat(msg);
    }
  }, { timezone: 'Asia/Shanghai' });
}
