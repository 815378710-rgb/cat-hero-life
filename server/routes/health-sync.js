// Apple Health数据同步接口
// 支持两种方式：POST JSON 或 GET query参数

import { Router } from 'express';
const router = Router();

// 处理参数的核心逻辑
function syncHealthData(db, params) {
  const user = db.prepare('SELECT id, stat_health FROM users LIMIT 1').get();
  if (!user) throw new Error('无用户');

  const { steps=0, exercise_minutes=0, sleep_hours=0, heart_rate_avg=0, active_calories=0, distance_km=0 } = params;
  const date = params.date || new Date(new Date().getTime()+8*3600000).toISOString().split('T')[0];
  const s = Number(steps), e = Number(exercise_minutes), sh = Number(sleep_hours), h = Number(heart_rate_avg), ac = Number(active_calories), dk = Number(distance_km);
  // 防 NaN
  if (isNaN(s) || isNaN(e) || isNaN(sh) || isNaN(h) || isNaN(ac) || isNaN(dk)) {
    return { success: false, error: '参数必须为数字' };
  }

  const existing = db.prepare('SELECT id FROM health_data WHERE user_id = ? AND date = ?').get(user.id, date);
  if (existing) {
    db.prepare("UPDATE health_data SET steps=?,exercise_minutes=?,sleep_hours=?,heart_rate_avg=?,active_calories=?,distance_km=?,synced_at=datetime('now') WHERE id=?")
      .run(s,e,sh,h,ac,dk,existing.id);
  } else {
    db.prepare('INSERT INTO health_data (id,user_id,date,steps,exercise_minutes,sleep_hours,heart_rate_avg,active_calories,distance_km) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(Date.now().toString(36)+Math.random().toString(36).slice(2,8),user.id,date,s,e,sh,h,ac,dk);
  }

  let score = 50;
  if (s>3000) score+=10; if (s>8000) score+=15;
  if (e>15) score+=10; if (e>30) score+=10;
  if (sh>=6) score+=5; if (sh>=8) score+=5;
  score = Math.min(100, score);

  db.prepare('UPDATE users SET stat_health=? WHERE id=?').run(score, user.id);
  try {
    db.prepare('INSERT INTO dimension_history (id,user_id,dimension,score) VALUES (?,?,?,?)')
      .run(Date.now().toString(36)+Math.random().toString(36).slice(2,8),user.id,'health',score);
  } catch(e) { console.error('dimension_history 写入失败:', e.message); }

  return { success:true, health_score:score, data:{steps:s, exercise_minutes:e, sleep_hours:sh} };
}

// GET: 最简单方式，直接在浏览器/快捷指令里用URL参数
// 例: /api/health/apple-health?steps=8000&sleep_hours=7.5&exercise_minutes=30
router.get('/apple-health', (req, res) => {
  try {
    const result = syncHealthData(req.db, req.query);
    res.json(result);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// POST: JSON方式
router.post('/apple-health', (req, res) => {
  try {
    const result = syncHealthData(req.db, req.body);
    res.json(result);
  } catch(e) { res.status(500).json({ error:e.message }); }
});

// 获取最近健康数据
router.get('/health-data', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const data = db.prepare(
      "SELECT * FROM health_data WHERE user_id = ? ORDER BY date DESC LIMIT 7"
    ).all(user.id);

    // 计算趋势
    const today = data[0];
    const yesterday = data[1];
    let trend = '';
    if (today && yesterday) {
      if (today.steps > yesterday.steps * 1.1) trend = '📈 步数上升，保持！';
      else if (today.steps < yesterday.steps * 0.9) trend = '📉 步数下降，多走走？';
      if (today.sleep_hours < 6) trend += ' ⚠️ 睡眠不足6小时';
      if (today.exercise_minutes < 10) trend += ' 💪 今日运动量偏少';
    }

    res.json({
      today: today || null,
      history: data,
      trend,
      health_score: user.stat_health
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
