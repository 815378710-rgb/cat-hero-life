// 猫猫侠 健康检查 + 指标监控
import { Router } from 'express';
import { getDb, createDbWrapper } from '../db/init.js';
import { logger } from '../utils/logger.js';
import { silentStats } from '../utils/silent.js';

const router = Router();
const startTime = Date.now();

// 健康检查
router.get('/health', (req, res) => {
  try {
    const db = req.db;
    // 测试数据库连接
    db.prepare('SELECT 1').get();

    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const mem = process.memoryUsage();

    res.json({
      status: 'healthy',
      uptime,
      timestamp: new Date().toISOString(),
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB',
      },
      node: process.version,
    });
  } catch (e) {
    logger.error('Health check failed', { error: e.message });
    res.status(503).json({ status: 'unhealthy', error: e.message });
  }
});

// 系统指标
router.get('/metrics', (req, res) => {
  try {
    const db = req.db;
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();

    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    const stats = {
      users: 1,
      tasks: {
        total: db.prepare('SELECT COUNT(*) as c FROM tasks').get().c,
        today: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE scheduled_date = ?").get(today).c,
        completed: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'completed'").get().c,
      },
      checkins: {
        total: db.prepare('SELECT COUNT(*) as c FROM check_ins').get().c,
        today: db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE date(checked_at) = ?").get(today).c,
      },
      chat: {
        total: db.prepare('SELECT COUNT(*) as c FROM chat_history').get().c,
        today: db.prepare("SELECT COUNT(*) as c FROM chat_history WHERE date(created_at) = ?").get(today).c,
      },
      memory: {
        total: db.prepare('SELECT COUNT(*) as c FROM memory_system').get().c,
      },
      habits: {
        total: db.prepare('SELECT COUNT(*) as c FROM habits').get().c,
        active: db.prepare('SELECT COUNT(*) as c FROM habits WHERE is_active = 1').get().c,
      },
      achievements: {
        unlocked: db.prepare('SELECT COUNT(*) as c FROM user_achievements').get().c,
      },
      user: user ? {
        level: user.level,
        exp: user.exp,
        coins: user.coins,
        streak: user.consecutive_sign_days,
        health: user.stat_health,
        mental: user.stat_mental,
      } : null,
      system: {
        uptime: Math.floor((Date.now() - startTime) / 1000),
        memory: process.memoryUsage(),
        node: process.version,
        // 被空 catch 吞掉的错误（去重计数），便于发现静默失效的功能
        silentErrors: silentStats(),
      },
    };

    res.json(stats);
  } catch (e) {
    logger.error('Metrics failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// 数据库备份
router.post('/backup', async (req, res) => {
  try {
    const { saveDbImmediate } = await import('../db/init.js');
    saveDbImmediate();
    logger.info('Database backup triggered');
    res.json({ success: true, message: '数据库已备份' });
  } catch (e) {
    logger.error('Backup failed', { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// 生成周报
router.post('/reports/weekly', async (req, res) => {
  try {
    const { generateWeeklyReport } = await import('../services/life-reports.js');
    const db = req.db;
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const report = await generateWeeklyReport(user.id, user.username);
    res.json({ success: true, report });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 生成月报
router.post('/reports/monthly', async (req, res) => {
  try {
    const { generateMonthlyReport } = await import('../services/life-reports.js');
    const db = req.db;
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const report = await generateMonthlyReport(user.id, user.username);
    res.json({ success: true, report });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 查看历史报告
router.get('/reports', (req, res) => {
  try {
    const { getReports } = require('../services/life-reports.js');
    const db = req.db;
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const reports = getReports(user.id, 10);
    res.json({ reports });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 综合仪表盘（含文本图表）
router.get('/dashboard', async (req, res) => {
  try {
    const { generateDashboard } = await import('../services/output-engine.js');
    const db = req.db;
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const dash = await generateDashboard(user.id, user.username);
    res.json({ success: true, dashboard: dash });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 图片上传（多模态入口）
router.post('/upload-image', async (req, res) => {
  try {
    const { saveBase64Image, analyzeImage } = await import('../services/multimodal-service.js');
    const { image, prompt } = req.body;
    if (!image) return res.status(400).json({ error: 'no image data' });
    
    const saved = saveBase64Image(image);
    const result = await analyzeImage(image, prompt || '请描述这张图片');
    res.json({ success: true, file: saved, analysis: result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// TTS 语音合成
router.post('/tts', async (req, res) => {
  try {
    const { textToSpeech } = await import('../services/output-engine.js');
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, error: 'no text' });
    const result = await textToSpeech(text);
    if (result.error) return res.status(500).json({ success: false, error: result.error });
    res.json({ success: true, ...result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

export default router;
