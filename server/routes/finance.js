import { Router } from 'express';
import crypto from 'crypto';

const router = Router();
const POTATO_MONEY_API = 'http://192.168.68.161:8901/api';

// 从土豆记账同步财务数据
router.get('/sync', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id, stat_finance FROM users LIMIT 1').get();
    if (!user) return res.status(400).json({ error: '用户不存在' });

    // 从土豆记账获取数据
    const response = await fetch(`${POTATO_MONEY_API}/records`);
    const json = await response.json();
    if (!json.success || !json.data) {
      return res.json({ synced: 0, message: '土豆记账无数据' });
    }

    const records = json.data;
    const today = new Date();
    const offset = (today.getUTCHours() + 8) >= 0 ? today : new Date(today.getTime() + 8 * 3600000);
    const todayStr = offset.toISOString().split('T')[0];

    // 计算统计数据
    let todayIncome = 0, todayExpense = 0;
    let weekIncome = 0, weekExpense = 0;
    let monthIncome = 0, monthExpense = 0;

    const weekStart = new Date(offset);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split('T')[0];
    
    const monthStart = `${todayStr.slice(0, 7)}-01`;

    for (const r of records) {
      if (r.type === 'income') {
        if (r.date === todayStr) todayIncome += r.amount;
        if (r.date >= weekStartStr) weekIncome += r.amount;
        if (r.date >= monthStart) monthIncome += r.amount;
      } else {
        if (r.date === todayStr) todayExpense += r.amount;
        if (r.date >= weekStartStr) weekExpense += r.amount;
        if (r.date >= monthStart) monthExpense += r.amount;
      }
    }

    // 存入财务统计表
    const existing = db.prepare('SELECT id FROM finance_stats WHERE user_id = ? AND date = ?').get(user.id, todayStr);
    if (existing) {
      db.prepare(`UPDATE finance_stats SET 
        today_income = ?, today_expense = ?,
        week_income = ?, week_expense = ?,
        month_income = ?, month_expense = ?,
        total_records = ?, synced_at = datetime('now')
        WHERE id = ?`)
        .run(todayIncome, todayExpense, weekIncome, weekExpense, monthIncome, monthExpense, records.length, existing.id);
    } else {
      db.prepare(`INSERT INTO finance_stats 
        (id, user_id, date, today_income, today_expense, week_income, week_expense, month_income, month_expense, total_records)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(crypto.randomUUID(), user.id, todayStr, todayIncome, todayExpense, weekIncome, weekExpense, monthIncome, monthExpense, records.length);
    }

    // 更新用户财务维度分（支出管理越好分越高）
    const ratio = monthIncome > 0 ? Math.min(monthExpense / monthIncome, 2) : 1;
    const financeScore = Math.round(Math.max(0, 100 - ratio * 50));
    db.prepare('UPDATE users SET stat_finance = ? WHERE id = ?').run(financeScore, user.id);

    res.json({
      synced: records.length,
      today: { income: todayIncome, expense: todayExpense, net: todayIncome - todayExpense },
      week: { income: weekIncome, expense: weekExpense, net: weekIncome - weekExpense },
      month: { income: monthIncome, expense: monthExpense, net: monthIncome - monthExpense },
      finance_score: financeScore
    });
  } catch (e) {
    console.error('Finance sync error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 获取财务概览
router.get('/summary', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id, stat_finance FROM users LIMIT 1').get();
    const today = new Date();
    const offset = new Date(today.getTime() + 8 * 3600000);
    const todayStr = offset.toISOString().split('T')[0];

    const stats = db.prepare('SELECT * FROM finance_stats WHERE user_id = ? ORDER BY date DESC LIMIT 1').get(user.id);
    
    // 如果没有同步过，尝试自动同步
    if (!stats) {
      return res.json({
        message: '尚未同步，请先调用 /api/finance/sync',
        synced: false,
        finance_score: user.stat_finance || 50
      });
    }

    // 获取最近30天趋势
    const monthStart = new Date(offset);
    monthStart.setDate(1);
    const trends = db.prepare(
      'SELECT date, today_income as income, today_expense as expense, (today_income - today_expense) as net FROM finance_stats WHERE user_id = ? AND date >= ? ORDER BY date ASC'
    ).all(user.id, monthStart.toISOString().split('T')[0]);

    res.json({
      synced: true,
      stats,
      trends,
      finance_score: user.stat_finance || 50,
      last_synced: stats.synced_at
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
