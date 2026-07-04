import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { propagate } from '../services/neural-engine.js';
import { calculateCurrentEnergy, getEnergyLevel } from '../services/energy-model.js';
import { detectLifeStage, getStageTaskTemplates } from '../services/lifecycle.js';

const router = Router();

router.get('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { status, date, dimension_id } = req.query;
    const today = date || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    
    let sql = `SELECT t.*, ld.name as dimension_name, ld.icon as dimension_icon, ld.color as dimension_color, g.title as goal_title
      FROM tasks t LEFT JOIN life_dimensions ld ON t.dimension_id = ld.id LEFT JOIN goals g ON t.goal_id = g.id WHERE t.user_id = ?`;
    const params = [user.id];
    
    if (status) { sql += ' AND t.status = ?'; params.push(status); }
    if (date) { sql += ' AND t.scheduled_date = ?'; params.push(date); }
    if (dimension_id) { sql += ' AND t.dimension_id = ?'; params.push(dimension_id); }
    sql += ' ORDER BY t.created_at DESC';
    
    const tasks = db.prepare(sql).all(...params);
    const grouped = {
      pending: tasks.filter(t => t.status === 'pending'),
      in_progress: tasks.filter(t => t.status === 'in_progress'),
      completed: tasks.filter(t => t.status === 'completed'),
      failed: tasks.filter(t => t.status === 'failed')
    };
    res.json({ tasks, grouped, date: today });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { title, description, dimension_id, goal_id, task_type, difficulty, scheduled_date, repeat_rule } = req.body;
    const id = uuid();
    const rewards = { easy: { exp: 10, coins: 5 }, medium: { exp: 20, coins: 10 }, hard: { exp: 40, coins: 20 }, epic: { exp: 80, coins: 40 } };
    const r = rewards[difficulty] || rewards.medium;
    
    db.prepare(`INSERT INTO tasks (id, user_id, goal_id, dimension_id, title, description, task_type, difficulty, exp_reward, coin_reward, scheduled_date, repeat_rule)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, user.id, goal_id || null, dimension_id, title, description || null, task_type || 'daily', difficulty || 'medium', r.exp, r.coins, scheduled_date || null, repeat_rule ? JSON.stringify(repeat_rule) : null);
    
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/complete', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, user.id);
    if (!task) return res.status(404).json({ error: '任务不存在' });
    if (task.status === 'completed') return res.json({ success: false, message: '已经完成了喵~' });
    
    db.prepare("UPDATE tasks SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(task.id);
    
    const { newLevel, newExp } = addExp(user, task.exp_reward);
    db.prepare('UPDATE users SET level = ?, exp = ?, coins = coins + ?, total_exp = total_exp + ?, updated_at = datetime(\'now\') WHERE id = ?')
      .run(newLevel, newExp, task.coin_reward, task.exp_reward, user.id);
    
    if (task.goal_id) db.prepare('UPDATE goals SET current_value = current_value + 1 WHERE id = ?').run(task.goal_id);
    updateDimensionStat(db, user.id, task.dimension_id, 2);
    
    // 神经传播：任务完成触发维度间影响
    try { propagate(db, user.id, task.dimension_id, 3); } catch (e) { console.error('传播失败:', e.message); }
    
    res.json({ success: true, message: `完成任务喵！+${task.exp_reward}经验 +${task.coin_reward}金币 🎉`, exp: task.exp_reward, coins: task.coin_reward, level_up: newLevel > user.level, new_level: newLevel });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/skip', (req, res) => {
  const db = req.db;
  try { db.prepare("UPDATE tasks SET status = 'skipped' WHERE id = ?").run(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', (req, res) => {
  const db = req.db;
  try { db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/generate-daily', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    const existing = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ?").get(user.id, today);
    if (existing.c > 0) return res.json({ success: false, message: '今天的任务已经生成了喵~' });
    
    // 能量适配：根据能量等级限制任务难度
    const energy = calculateCurrentEnergy(db, user.id);
    const energyLevel = getEnergyLevel(energy);
    const difficultyOrder = ['easy', 'medium', 'hard', 'epic'];
    const maxDifficultyIndex = difficultyOrder.indexOf(energyLevel.maxDifficulty === 'none' ? 'easy' : energyLevel.maxDifficulty);
    
    // 生命周期适配：根据人生阶段调整任务侧重
    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    const stageTemplates = getStageTaskTemplates(profile);
    
    const allTasks = [
      { dimension: 'health', title: '喝8杯水', desc: '保持身体水分充足', difficulty: 'easy', exp: 10, coins: 5 },
      { dimension: 'health', title: '运动30分钟', desc: '跑步/健身/散步都行', difficulty: 'medium', exp: 20, coins: 10 },
      { dimension: 'health', title: '按时吃三餐', desc: '早餐一定要吃', difficulty: 'easy', exp: 10, coins: 5 },
      { dimension: 'learning', title: '学习1小时', desc: '专注学习新知识', difficulty: 'medium', exp: 20, coins: 10 },
      { dimension: 'habits', title: '今日复盘', desc: '回顾今天做了什么', difficulty: 'easy', exp: 15, coins: 8 },
      { dimension: 'mental', title: '冥想10分钟', desc: '放空大脑，深呼吸', difficulty: 'easy', exp: 10, coins: 5 },
      { dimension: 'finance', title: '记录今日支出', desc: '记账是理财的第一步', difficulty: 'easy', exp: 10, coins: 5 },
      { dimension: 'social', title: '联系一个朋友', desc: '发个消息问候一下', difficulty: 'easy', exp: 10, coins: 5 },
    ];
    
    // 加入生命周期适配任务
    for (const [dim, templates] of Object.entries(stageTemplates)) {
      if (templates && templates.length > 0 && !allTasks.find(t => t.dimension === dim)) {
        allTasks.push({ dimension: dim, title: templates[0], desc: `基于你的人生阶段`, difficulty: 'easy', exp: 10, coins: 5 });
      }
    }
    
    // 根据能量等级过滤任务难度
    const filteredTasks = allTasks.filter(t => {
      const taskDiffIndex = difficultyOrder.indexOf(t.difficulty);
      return taskDiffIndex <= maxDifficultyIndex;
    });
    
    const count = 4 + Math.floor(Math.random() * 3);
    const selected = (filteredTasks.length >= count ? filteredTasks : allTasks).sort(() => Math.random() - 0.5).slice(0, count);
    
    for (const t of selected) {
      db.prepare(`INSERT INTO tasks (id, user_id, dimension_id, title, description, task_type, difficulty, exp_reward, coin_reward, scheduled_date)
        VALUES (?, ?, ?, ?, ?, 'daily', ?, ?, ?, ?)`).run(uuid(), user.id, t.dimension, t.title, t.desc, t.difficulty, t.exp, t.coins, today);
    }
    
    res.json({ success: true, count: selected.length, message: `为${user.username}生成了${selected.length}个今日任务喵~` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function addExp(user, exp) {
  const getExpForLevel = (l) => Math.floor(100 * Math.pow(1.15, l - 1));
  let newExp = user.exp + exp, newLevel = user.level;
  while (newExp >= getExpForLevel(newLevel + 1)) { newExp -= getExpForLevel(newLevel + 1); newLevel++; }
  return { newLevel, newExp };
}

function updateDimensionStat(db, userId, dimensionId, delta) {
  const colMap = { health: 'stat_health', finance: 'stat_finance', learning: 'stat_learning', career: 'stat_career', social: 'stat_social', mental: 'stat_mental', habits: 'stat_habits', creativity: 'stat_creativity' };
  const col = colMap[dimensionId];
  if (col) db.prepare(`UPDATE users SET ${col} = MIN(100, ${col} + ?), updated_at = datetime('now') WHERE id = ?`).run(delta, userId);
}

export default router;
