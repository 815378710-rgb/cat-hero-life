import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { propagate } from '../services/neural-engine.js';

function validateNumber(value, min, max, fieldName) {
  const num = parseFloat(value);
  if (isNaN(num)) return { valid: false, error: `${fieldName}必须是数字` };
  if (min !== undefined && num < min) return { valid: false, error: `${fieldName}不能小于${min}` };
  if (max !== undefined && num > max) return { valid: false, error: `${fieldName}不能大于${max}` };
  return { valid: true, value: num };
}

const router = Router();

router.get('/heatmap', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { days } = req.query;
    const daysNum = parseInt(days) || 365;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    // 获取打卡数据
    const checkins = db.prepare(`
      SELECT date(checked_at) as date, COUNT(*) as count 
      FROM check_ins 
      WHERE user_id = ? AND date(checked_at) >= ?
      GROUP BY date(checked_at)
    `).all(user.id, startDateStr);
    
    // 构建日期映射
    const dateMap = {};
    checkins.forEach(c => {
      dateMap[c.date] = c.count;
    });
    
    // 计算连续天数
    let currentStreak = 0;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    for (let i = 0; i < 365; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (dateMap[dateStr] && dateMap[dateStr] > 0) {
        currentStreak++;
      } else if (i > 0) {
        break;
      }
    }
    
    // 计算最长连续
    let maxStreak = 0;
    let tempStreak = 0;
    const allDates = Object.keys(dateMap).sort();
    for (let i = 0; i < allDates.length; i++) {
      if (i === 0 || (new Date(allDates[i]).getTime() - new Date(allDates[i-1]).getTime()) / 86400000 === 1) {
        tempStreak++;
        maxStreak = Math.max(maxStreak, tempStreak);
      } else {
        tempStreak = 1;
      }
    }
    
    // 构建weeks数组（简化版）
    const weeks = [];
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    for (let w = 0; w < Math.ceil(daysNum / 7); w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + w * 7 + d);
        date.setHours(0, 0, 0, 0);
        
        if (date > todayDate) break;
        
        const dateStr = date.toISOString().split('T')[0];
        week.push({
          date: dateStr,
          count: dateMap[dateStr] || 0,
          isToday: dateStr === today
        });
      }
      if (week.length > 0) {
        weeks.push(week);
      }
    }
    
    res.json({
      weeks,
      total: checkins.reduce((sum, c) => sum + c.count, 0),
      currentStreak,
      maxStreak
    });
  } catch (e) { 
    console.error('Heatmap error:', e);
    res.status(500).json({ error: e.message }); 
  }
});

router.post('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    if (!user) return res.status(400).json({ error: '用户不存在' });
    const { task_id, dimension_id, check_type, title, value, note, mood, energy } = req.body;
    
    // 验证
    if (!dimension_id) return res.status(400).json({ error: '请选择维度' });
    if (!title || title.trim() === '') return res.status(400).json({ error: '请输入标题' });
    if (value !== undefined && value !== null) {
      const v = validateNumber(value, -10000, 100000, '数值');
      if (!v.valid) return res.status(400).json({ error: v.error });
    }
    if (mood !== undefined && mood !== null) {
      const m = validateNumber(mood, 1, 5, '心情');
      if (!m.valid) return res.status(400).json({ error: m.error });
    }
    
    // 去重（同维度同标题同天）
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    const existing = db.prepare("SELECT id FROM check_ins WHERE user_id = ? AND dimension_id = ? AND title = ? AND date(checked_at) = ?").get(user.id, dimension_id, title.trim(), today);
    if (existing && check_type !== 'manual') {
      return res.json({ success: false, message: '今天已经打过卡了~' });
    }
    
    const id = uuid();
    const safeVal = (v) => v === undefined ? null : v;
    
    db.prepare(`INSERT INTO check_ins (id, user_id, task_id, dimension_id, check_type, title, value, note, mood, energy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, user.id, task_id || null, dimension_id, check_type || 'manual', title.trim(), value != null ? value : null, note || null, mood != null ? mood : null, energy != null ? energy : null);
    
    const colMap = { health: 'stat_health', finance: 'stat_finance', learning: 'stat_learning', career: 'stat_career', social: 'stat_social', mental: 'stat_mental', habits: 'stat_habits', creativity: 'stat_creativity' };
    const col = colMap[dimension_id];
    if (col) db.prepare(`UPDATE users SET ${col} = MIN(100, ${col} + 1), updated_at = datetime('now') WHERE id = ?`).run(user.id);
    
    // 神经传播：打卡触发维度间影响
    try { propagate(db, user.id, dimension_id, 2); } catch (e) { console.error('传播失败:', e.message); }
    
    const expReward = 5, coinReward = 2;
    const getExpForLevel = (l) => Math.floor(100 * Math.pow(1.15, l - 1));
    let newExp = user.exp + expReward, newLevel = user.level;
    while (newExp >= getExpForLevel(newLevel + 1)) { newExp -= getExpForLevel(newLevel + 1); newLevel++; }
    db.prepare('UPDATE users SET level = ?, exp = ?, coins = coins + ?, total_exp = total_exp + ? WHERE id = ?').run(newLevel, newExp, coinReward, expReward, user.id);
    
    res.json({ success: true, id, exp: expReward, coins: coinReward });
  } catch (e) { console.error('Checkin POST error:', e); res.status(500).json({ error: e.message || String(e) }); }
});

router.get('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { date, dimension_id, limit } = req.query;
    let sql = `SELECT ci.*, ld.name as dimension_name, ld.icon as dimension_icon FROM check_ins ci LEFT JOIN life_dimensions ld ON ci.dimension_id = ld.id WHERE ci.user_id = ?`;
    const params = [user.id];
    if (date) { sql += ' AND date(ci.checked_at) = ?'; params.push(date); }
    if (dimension_id) { sql += ' AND ci.dimension_id = ?'; params.push(dimension_id); }
    sql += ' ORDER BY ci.checked_at DESC LIMIT ?';
    params.push(parseInt(limit) || 50);
    res.json({ checkins: db.prepare(sql).all(...params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/today', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    const summary = db.prepare(`SELECT dimension_id, COUNT(*) as count, SUM(value) as total_value FROM check_ins WHERE user_id = ? AND date(checked_at) = ? GROUP BY dimension_id`).all(user.id, today);
    const totalToday = db.prepare(`SELECT COUNT(*) as count FROM check_ins WHERE user_id = ? AND date(checked_at) = ?`).get(user.id, today);
    res.json({ summary, total: totalToday.count, date: today });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
