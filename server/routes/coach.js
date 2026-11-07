import { Router } from 'express';
import { generateCoachAdvice, generateSmartTasks, detectHabitChains } from '../services/ai-coach.js';

const router = Router();

// AI教练建议
router.get('/advice', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const advice = generateCoachAdvice(db, user.id);
    res.json(advice);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 智能任务推荐
router.get('/smart-tasks', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const count = parseInt(req.query.count) || 3;
    const tasks = generateSmartTasks(db, user.id, count);
    res.json({ tasks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 习惯连锁分析
router.get('/habit-chains', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const chains = detectHabitChains(db, user.id);
    res.json({ chains });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
