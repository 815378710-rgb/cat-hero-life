import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDb, getDb, createDbWrapper, getDbAsync, saveDbImmediate } from './db/init.js';
import userRoutes from './routes/user.js';
import taskRoutes from './routes/tasks.js';
import checkinRoutes from './routes/checkins.js';
import gamificationRoutes from './routes/gamification.js';
import chatRoutes from './routes/chat.js';
import eventRoutes from './routes/events.js';
import habitRoutes from './routes/habits.js';
import reportRoutes from './routes/reports.js';
import insightRoutes from './routes/insights.js';
import shopRoutes from './routes/shop.js';
import goalRoutes from './routes/goals.js';
import profileRoutes from './routes/profile.js';
import planRoutes from './routes/plans.js';
import memoryRoutes from './routes/memory.js';
import dialogueRoutes from './routes/dialogues.js';
import aiConfigRoutes from './routes/ai-config.js';
import wechatRoutes from './routes/wechat.js';
import onboardingRoutes from './routes/onboarding.js';
import smartTaskRoutes from './routes/smart-tasks.js';
import notificationRoutes from './routes/notifications.js';
import goalPlannerRoutes from './routes/goal-planner.js';
import dailyReviewRoutes from './routes/daily-review.js';
import narrativeRoutes from './routes/narrative.js';
import lifeToolsRoutes from './routes/life-tools.js';
import lifeDashboardRoutes from './routes/life-dashboard.js';
import feishuRoutes from './routes/feishu.js';
import gewechatRoutes from './routes/gewechat.js';
import deepDataRoutes from './routes/deep-data.js';
import coachRoutes from './routes/coach.js';
import socialRoutes from './routes/social.js';
import wechatBotRoutes from './routes/wechat-bot.js';
import neuralRoutes from './routes/neural.js';
import systemRoutes from './routes/system.js';
import wechatService from './services/wechat.js';
import { logger } from './utils/logger.js';
import { propagate } from './services/neural-engine.js';
import { calculateCurrentEnergy, learnEnergyBaseline } from './services/energy-model.js';
import { takeBalanceSnapshot } from './services/balance-radar.js';
import { checkDecisionOutcome, getPendingChecks } from './services/decision-tracker.js';
import { consolidateMemories, decayMemories } from './services/memory-system.js';
import { initStoryArcs, initQuestChains, initCatEvolutions, initTitles, checkTitleUnlocks } from './services/gamification-deep.js';
import { initInfluenceMatrix } from './services/neural-engine.js';
import { startScheduler } from './services/scheduler.js';
import { setAiConfig } from './services/ai-engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// Async startup
async function start() {
  // Initialize database
  await initDb();
  
  const app = express();
  
  app.use(cors());
  app.use(express.json());
  app.use(logger.middleware());
  app.use(express.static(join(__dirname, '..', 'dist')));
  
  // Make db wrapper available
  app.use((req, res, next) => {
    const rawDb = getDb();
    req.db = createDbWrapper(rawDb);
    next();
  });
  
  // API Routes
  app.use('/api/user', userRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/checkins', checkinRoutes);
  app.use('/api/gamification', gamificationRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/habits', habitRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/insights', insightRoutes);
  app.use('/api/shop', shopRoutes);
  app.use('/api/goals', goalRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/plans', planRoutes);
  app.use('/api/memory', memoryRoutes);
  app.use('/api/dialogues', dialogueRoutes);
  app.use('/api/ai', aiConfigRoutes);
  app.use('/api/wechat', wechatRoutes);
  app.use('/api/onboarding', onboardingRoutes);
  app.use('/api/smart-tasks', smartTaskRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/goal-planner', goalPlannerRoutes);
  app.use('/api/daily-review', dailyReviewRoutes);
  app.use('/api/narrative', narrativeRoutes);
  app.use('/api/life-tools', lifeToolsRoutes);
  app.use('/api/life-dashboard', lifeDashboardRoutes);
  app.use('/api/feishu', feishuRoutes);
  app.use('/api/coach', coachRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/wechat-bot', wechatBotRoutes);
  app.use('/api/gewechat', gewechatRoutes);
  app.use('/api/deep', deepDataRoutes);
  app.use('/api/neural', neuralRoutes);
  app.use('/api/system', systemRoutes);
  
  // 数据备份下载
  app.get('/api/backup', (req, res) => {
    const db = req.db;
    try {
      const user = db.prepare('SELECT id FROM users LIMIT 1').get();
      const backup = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        user: db.prepare('SELECT * FROM users WHERE id = ?').get(user.id),
        profile: db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id),
        tasks: db.prepare('SELECT * FROM tasks WHERE user_id = ?').all(user.id),
        checkins: db.prepare('SELECT * FROM check_ins WHERE user_id = ?').all(user.id),
        habits: db.prepare('SELECT * FROM habits WHERE user_id = ?').all(user.id),
        goals: db.prepare('SELECT * FROM goals WHERE user_id = ?').all(user.id),
        achievements: db.prepare('SELECT * FROM user_achievements WHERE user_id = ?').all(user.id),
        memories: db.prepare('SELECT * FROM ai_memory WHERE user_id = ?').all(user.id),
        emotions: db.prepare('SELECT * FROM emotion_logs WHERE user_id = ?').all(user.id),
        narrative: db.prepare('SELECT * FROM life_narrative WHERE user_id = ?').all(user.id),
        chat_history: db.prepare('SELECT * FROM chat_history WHERE user_id = ? ORDER BY created_at').all(user.id)
      };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=cat-hero-backup.json');
      res.json(backup);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  
  // Dashboard data
  app.get('/api/dashboard', (req, res) => {
    const db = req.db;
    try {
      const user = db.prepare('SELECT * FROM users LIMIT 1').get();
      const today = new Date().toISOString().split('T')[0];
      
      const todayTasks = db.prepare(`
        SELECT t.*, ld.name as dimension_name, ld.icon as dimension_icon, ld.color as dimension_color
        FROM tasks t 
        LEFT JOIN life_dimensions ld ON t.dimension_id = ld.id
        WHERE t.user_id = ? AND (t.scheduled_date = ? OR t.scheduled_date IS NULL)
        ORDER BY t.created_at DESC
      `).all(user.id, today);
      
      const todayCheckins = db.prepare(`
        SELECT COUNT(*) as count FROM check_ins 
        WHERE user_id = ? AND date(checked_at) = ?
      `).get(user.id, today);
      
      const recentAchievements = db.prepare(`
        SELECT a.*, ua.unlocked_at 
        FROM user_achievements ua 
        JOIN achievements a ON ua.achievement_id = a.id 
        WHERE ua.user_id = ? 
        ORDER BY ua.unlocked_at DESC LIMIT 5
      `).all(user.id);
      
      const streakInfo = db.prepare(`
        SELECT consecutive_sign_days, last_sign_date FROM users WHERE id = ?
      `).get(user.id);
      
      const dimensionStats = db.prepare(`
        SELECT ld.id, ld.name, ld.icon, ld.color,
          (SELECT COUNT(*) FROM check_ins ci WHERE ci.dimension_id = ld.id AND ci.user_id = ?) as total_checkins,
          (SELECT COUNT(*) FROM check_ins ci WHERE ci.dimension_id = ld.id AND ci.user_id = ? AND date(ci.checked_at) = date('now')) as today_checkins
        FROM life_dimensions ld ORDER BY ld.sort_order
      `).all(user.id, user.id);
      
      res.json({
        user,
        todayTasks,
        todayCheckins: todayCheckins.count,
        recentAchievements,
        streak: streakInfo,
        dimensionStats
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  
  // SPA fallback
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
    }
  });
  
  // Load AI config from database
  try {
    const { getDb, createDbWrapper } = await import('./db/init.js');
    const rawDb = getDb();
    const w = createDbWrapper(rawDb);
    try {
      const cfg = w.prepare('SELECT * FROM ai_config LIMIT 1').get();
      if (cfg && cfg.api_key) {
        setAiConfig({ provider: cfg.provider, apiKey: cfg.api_key, model: cfg.model });
      }
    } catch {}
  } catch {}

  process.on('SIGINT', () => { saveDbImmediate(); process.exit(0); });
  process.on('SIGTERM', () => { saveDbImmediate(); process.exit(0); });

  app.listen(PORT, () => {
    console.log(`🐱 猫猫侠人生管理系统启动成功! http://localhost:${PORT}`);
    
    // 初始化神经智能系统
    try {
      const rawDb = getDb();
      const w = createDbWrapper(rawDb);
      initInfluenceMatrix(w);
      initStoryArcs(w);
      initQuestChains(w);
      initCatEvolutions(w);
      initTitles(w);
      console.log('🧠 神经智能系统初始化完成');
    } catch (e) { console.error('神经系统初始化失败:', e.message); }
    
    startScheduler();
    
    // 初始化微信服务
    wechatService.setDb(createDbWrapper(getDb()));
    
    // 每分钟检查是否需要发送微信提醒
    setInterval(async () => {
      try {
        await wechatService.dailyReminderCheck(createDbWrapper(getDb()));
      } catch (e) {}
    }, 60000);
  });
}

start().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
