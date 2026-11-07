// 设置时区为中国时间
process.env.TZ = 'Asia/Shanghai';

import express from 'express';
import cors from 'cors';
import zlib from 'node:zlib';
import { accessGuard, unlockHandler } from './middleware/access-guard.js';
import { getPersona } from './services/persona.js';
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
import financeRoutes from './routes/finance.js';
import healthSyncRoutes from './routes/health-sync.js';
import coachRoutes from './routes/coach.js';
import socialRoutes from './routes/social.js';
import wechatBotRoutes from './routes/wechat-bot.js';
import neuralRoutes from './routes/neural.js';
import systemRoutes from './routes/system.js';
import toolsRoutes from './routes/tools.js';
import lotteryRoutes from './routes/lottery.js';
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
import { setAiConfig, registerToolExecutor } from './services/ai-engine.js';
import { generateAnalysis } from './services/ai-analyst.js';
import { startNeuralCoordinator } from './services/neural-coordinator.js';
import { startProactiveEngine } from './services/proactive-engine.js';
import { startExternalDataPolling, getLatestExternalData } from './services/external-data.js';
import { startConsciousnessLoop } from './services/consciousness-loop.js';
import { syncConceptToStats } from './services/concept-graph.js';
import { ensureTable as initEmotionEngine } from './services/emotion-engine.js';

// ===== 系统自愈 =====
function setupSelfHealing() {
  const criticalModules = [
    { name: 'proactive-engine', restart: async () => { const m = await import('./services/proactive-engine.js'); m.startProactiveEngine(); } },
    { name: 'external-data', restart: async () => { const m = await import('./services/external-data.js'); m.startExternalDataPolling(); } },
    { name: 'consciousness-loop', restart: async () => { const m = await import('./services/consciousness-loop.js'); m.startConsciousnessLoop(); } },
  ];

  // 每5分钟检查关键模块健康状态
  setInterval(async () => {
    try {
      const { getAllStatus } = await import('./services/wechat-monitor.js');
      const status = getAllStatus();
      
      // 微信通道异常→尝试重连
      if (status.overall === 'all_offline') {
        console.log('[自愈] 检测到微信通道全部离线，尝试恢复...');
        try {
          const { tryAutoReconnect } = await import('./services/gewechat-service.js');
          await tryAutoReconnect();
        } catch {}
      }
    } catch (e) { console.error('[自愈] 健康检查失败:', e.message); }
  }, 5 * 60_000);

  console.log('🩺 系统自愈监控已启动（每5分钟）');
}

const __dirname = dirname(fileURLToPath(import.meta.url));

// ===== Function Calling 工具注册 =====
function registerToolExecutors() {
  // 查记忆
  registerToolExecutor('lookup_memory', async (args, db, userId) => {
    const { getDb } = await import('./db/init.js');
    const d = db || getDb();
    const memories = d.prepare(
      "SELECT title, summary, created_at FROM memory_system WHERE user_id = ? ORDER BY created_at DESC LIMIT 10"
    ).all(userId);
    return { count: memories.length, memories: memories.map(m => ({ title: m.title, summary: m.summary, time: m.created_at })) };
  });

  // 查目标
  registerToolExecutor('check_goals', async (args, db, userId) => {
    const { getDb } = await import('./db/init.js');
    const d = db || getDb();
    const category = args.category || 'all';
    let goals;
    if (category === 'all') {
      goals = d.prepare('SELECT title, target_value, unit, priority, deadline FROM goals WHERE user_id = ? ORDER BY priority DESC').all(userId);
    } else {
      const dimMap = { finance: '财务', career: '事业', health: '健康', learning: '学习' };
      const dimName = dimMap[category];
      const dim = d.prepare("SELECT id FROM life_dimensions WHERE name = ?").get(dimName);
      goals = dim ? d.prepare('SELECT title, target_value, unit, priority, deadline FROM goals WHERE user_id = ? AND dimension_id = ?').all(userId, dim.id) : [];
    }
    return { count: goals.length, goals };
  });

  // 记账
  registerToolExecutor('log_expense', async (args, db, userId) => {
    const { getDb } = await import('./db/init.js');
    const { v4: uid } = await import('uuid');
    const d = db || getDb();
    const amount = parseFloat(args.amount);
    if (isNaN(amount) || amount <= 0) return { error: '无效金额' };
    // 财务流水统一落在 finance_transactions（与 data-extractor 的对话记账保持一致）；
    // 历史代码写的 expense_logs 表在库中从未存在，导致 AI 记账每次都静默失败
    d.prepare("INSERT INTO finance_transactions (id, user_id, transaction_date, type, category, amount, description) VALUES (?, ?, date('now'), 'expense', ?, ?, ?)")
      .run(uid(), userId, args.category || '其他', amount, args.description || '');
    return { success: true, amount, category: args.category };
  });

  // 查天气
  registerToolExecutor('get_weather', async (args, db, userId) => {
    const { getDb } = await import('./db/init.js');
    const d = db || getDb();
    const profile = d.prepare('SELECT city FROM life_profile WHERE user_id = ?').get(userId);
    const city = args.city || profile?.city || '西安';
    const extData = getLatestExternalData();
    if (extData?.weather) {
      return { city: extData.weather.city, temp: extData.weather.temp, condition: extData.weather.condition };
    }
    return { city, message: '天气数据暂不可用，请稍后' };
  });

  // 查状态
  registerToolExecutor('check_stats', async (args, db, userId) => {
    const { getDb } = await import('./db/init.js');
    const d = db || getDb();
    const user = d.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return { error: '用户不存在' };
    const today = new Date().toISOString().split('T')[0];
    const checkins = d.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(userId, today)?.c || 0;
    const tasks = d.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(userId, today)?.c || 0;
    return {
      level: user.level, exp: user.exp, coins: user.coins,
      streak: user.consecutive_sign_days, todayCheckins: checkins, todayTasks: tasks,
      stats: { health: user.stat_health, finance: user.stat_finance, learning: user.stat_learning, career: user.stat_career }
    };
  });

  // 创建提醒
  registerToolExecutor('create_reminder', async (args, db, userId) => {
    const { getDb } = await import('./db/init.js');
    const d = db || getDb();
    d.prepare('INSERT INTO pending_wechat_msgs (id, user_id, message, status, metadata) VALUES (?, ?, ?, ?, ?)')
      .run(Date.now().toString(36) + Math.random().toString(36).slice(2, 8), userId,
        `提醒：${args.content}`, 'pending',
        JSON.stringify({ source: 'reminder', time: args.time }));
    return { success: true, content: args.content };
  });

  // 规划今日任务
  registerToolExecutor('plan_today_tasks', async (args, db, userId) => {
    const { getDb } = await import('./db/init.js');
    const d = db || getDb();
    const user = d.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const profile = d.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
    const goals = d.prepare("SELECT title, priority FROM goals WHERE user_id = ? AND deadline >= date('now')").all(userId);
    
    return {
      user: { level: user?.level, health: user?.stat_health, career: user?.stat_career, finance: user?.stat_finance },
      profile: { job: profile?.current_job, city: profile?.city },
      goals: goals.map(g => g.title),
      suggestion: '基于以上信息，建议 AI 生成 3-5 个今日任务，优先提升弱点维度'
    };
  });

  console.log('7 Function Calling 工具已注册');
}

const PORT = process.env.PORT || 3000;

// Async startup
// 修复：错过的连续签到天数从未归零
// 旧行为：last_sign_date 停留在很久以前，consecutive_sign_days 却一直是 1
// → 每天早安/随机消息都刷"连续签到1天"（实际已 30+ 天没签到）
const healStaleStreak = () => {
  try {
    const d = getDb();
    const info = d.prepare(
      "UPDATE users SET consecutive_sign_days = 0 " +
      "WHERE last_sign_date IS NOT NULL AND last_sign_date < date('now','-1 day') " +
      "AND consecutive_sign_days <> 0"
    ).run();
    if (info.changes) console.log('🔄 已归零过期连续签到:', info.changes, '个用户');
  } catch (e) { console.error('healStaleStreak 失败:', e.message); }
};

async function start() {
  // Initialize database
  await initDb();

  // 过期连续签到达 0（启动即修一次，之后每 30 分钟兜底）
  healStaleStreak();
  setInterval(healStaleStreak, 30 * 60 * 1000);

  const app = express();
  
  // CORS：仅允许已知来源
  const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:3000', 'https://life.maomaoxia.top'];
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: true
  }));
  // ⚠️ 聊天支持图片（base64）后，默认 100kb 限制会把图片请求直接 413 掉
  app.use(express.json({ limit: '20mb' }));
  app.use(logger.middleware());

  // 简易内存限流
  // ⚠️ 经 Cloudflare Tunnel 进入时 req.ip 恒为 cloudflared 容器内网 IP（如 ::ffff:172.17.0.1），
  //    若不优先取 CF-Connecting-IP，所有用户会共用同一个配额，极易整站 429（曾导致"打不开"）。
  const rateLimitMap = new Map();
  const RL_WINDOW = 60_000;
  const RL_MAX_READ = 600;   // GET/HEAD：页面并发加载 + 前端轮询需要余量
  const RL_MAX_WRITE = 120;  // POST/PUT/DELETE
  const RL_EXEMPT = [
    /^\/assets\//, /^\/tts\//, /^\/charts\//, /^\/favicon/,
    /^\/health$/, /^\/api\/system\/health$/
  ];
  app.use((req, res, next) => {
    const url = req.originalUrl || req.url || '';
    const now = Date.now();
    const sweep = () => {
      if (Math.random() < 0.002) {
        for (const [k, v] of rateLimitMap) { if (now > v.resetAt) rateLimitMap.delete(k); }
      }
    };
    // 静态资源与探针豁免，不计数
    if (RL_EXEMPT.some(re => re.test(url))) { sweep(); return next(); }

    const fwd = String(req.headers['cf-connecting-ip'] || '').trim()
      || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = fwd || req.ip || req.socket.remoteAddress || 'unknown';
    const isWrite = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';

    const entry = rateLimitMap.get(ip) || { read: 0, write: 0, resetAt: now + RL_WINDOW };
    if (now > entry.resetAt) { entry.read = 0; entry.write = 0; entry.resetAt = now + RL_WINDOW; }
    entry.read++;
    if (isWrite) entry.write++;
    rateLimitMap.set(ip, entry);

    if (entry.read > RL_MAX_READ || entry.write > RL_MAX_WRITE) {
      return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }
    sweep();
    next();
  });
  // 独立页面路由必须排在 express.static 之前：
  // dist/archive/ 是目录，静态中间件会对 /archive 先发 301 目录重定向，
  // 导致 app.get('/archive') 永远匹配不到。
  app.get('/lottery', (_req, res) => {
    res.sendFile(join(__dirname, '..', 'dist', 'lottery.html'));
  });
  app.get('/archive', (_req, res) => {
    res.sendFile(join(__dirname, '..', 'dist', 'archive.html'));
  });

  // 静态资源缓存策略
  // 背景：隧道跨境回源到洛杉矶，若每次都要重新拉 240KB 的 index.js，首屏会非常慢。
  // 构建产物文件名自带内容 hash，可安全长缓存；HTML 必须 no-cache 才能拿到新 hash。
  app.use(express.static(join(__dirname, '..', 'dist'), {
    setHeaders(res, filePath) {
      // Service Worker 脚本本身必须每次校验更新，不能被长缓存
      if (/(^|[/\\])sw\.js$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/\.html?$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/[.-][A-Za-z0-9_-]{6,}\.(js|css|woff2?|ttf|eot|svg|png|jpe?g|webp)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    }
  }));

  // 语音(TTS)/图表(charts)静态资源：data/tts, data/charts
  const dataDir = join(__dirname, '..', 'data');
  app.use('/tts', express.static(join(dataDir, 'tts')));
  app.use('/charts', express.static(join(dataDir, 'charts')));
  // 彩票照片等上传的图片
  app.use('/uploads', express.static(join(dataDir, 'uploads')));

  
  // Make db wrapper available
  app.use((req, res, next) => {
    const rawDb = getDb();
    req.db = createDbWrapper(rawDb);
    next();
  });

  // 访问口令保护
  // ⚠️ 必须挂在 gzip / responseCache 之前：响应缓存命中时会直接 res.json() 返回，
  //    若 guard 排在它后面，缓存命中即绕过鉴权（灰度验证实测过该漏洞）。
  // 解锁端点本身先注册且被 guard 放行。
  // 应急：CAT_HERO_ACCESS_GUARD=off 可临时关闭；口令见 data/access_token.txt
  //       或环境变量 CAT_HERO_ACCESS_TOKEN。
  app.post('/api/unlock', unlockHandler);
  app.use(accessGuard);

  // gzip 压缩
  // 背景：Cloudflare Tunnel 从淄博联通回源，隧道全部落地洛杉矶（lax01-13），
  // 跨境链路对 >3KB 的响应约 40% 概率中途断流。压缩后响应体减小约 70%，
  // 是当前唯一在应用层能显著降低超时率的手段。
  // 注意：必须在 responseCache 之前注册，保证缓存写入的是原始对象。
  app.use((req, res, next) => {
    const ae = String(req.headers['accept-encoding'] || '');
    if (!/\bgzip\b/i.test(ae)) return next();
    const passJson = res.json.bind(res);
    res.json = function (data) {
      try {
        if (res.getHeader('Content-Encoding')) return passJson(data);
        const raw = Buffer.from(JSON.stringify(data));
        if (raw.length < 512) return passJson(data);
        const gz = zlib.gzipSync(raw, { level: 6 });
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Length', String(gz.length));
        return res.end(gz);
      } catch (e) {
        return passJson(data);
      }
    };
    next();
  });

  // 响应缓存（读请求30秒内不重复查询）
  const responseCache = new Map();
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    const key = req.originalUrl;
    const cached = responseCache.get(key);
    if (cached && (Date.now() - cached.time) < 30000) {
      return res.json(cached.data);
    }
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      responseCache.set(key, { data, time: Date.now() });
      if (responseCache.size > 100) {
        const oldest = [...responseCache.entries()].sort((a,b) => a[1].time - b[1].time)[0];
        if (oldest) responseCache.delete(oldest[0]);
      }
      return originalJson(data);
    };
    next();
  });
  
  // API Routes
  // 当前人格（前端导航/房间页据此显示，切换 CAT_HERO_PERSONA 后自动同步）
  app.get('/api/persona', (_req, res) => {
    const p = getPersona();
    res.json({ id: p.id, name: p.name, emoji: p.emoji, tagline: p.tagline });
  });
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
  app.use('/api/finance', financeRoutes);
  app.use('/api/health', healthSyncRoutes);
  app.use('/api/tools', toolsRoutes);
  app.use('/api/lottery', lotteryRoutes);
  app.use('/api/neural', neuralRoutes);
  app.use('/api/system', systemRoutes);
  
  // AI数据分析
  app.post('/api/ai/analyze', async (req, res) => {
    try {
      const analysis = await generateAnalysis(req.db);
      res.json(analysis);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

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
      const bt = new Date(new Date().getTime() + 8 * 3600000).toISOString().split('T')[0];
      const today = bt; // 北京时区
      
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
      
      // 财务数据
      let finance = null;
      try {
        finance = db.prepare('SELECT * FROM finance_stats WHERE user_id = ? AND date = ?').get(user.id, today);
      } catch(e) { console.error('Dashboard 财务查询失败:', e.message); }
      
      // RPG随机事件（表名为 story_events，历史上误写为 events 导致功能一直静默失效）
      let randomEvent = null;
      try {
        const events = db.prepare(`
          SELECT se.* FROM story_events se
          WHERE se.is_active = 1
            AND se.id NOT IN (SELECT event_id FROM user_events WHERE user_id = ?)
          ORDER BY RANDOM() LIMIT 1
        `).all(user.id);
        randomEvent = events[0] || null;
        // choices / stat_effects 在库里是 JSON 字符串，前端按数组/对象使用，必须解析后再下发
        if (randomEvent) {
          try { randomEvent.choices = JSON.parse(randomEvent.choices || '[]'); } catch { randomEvent.choices = []; }
          try { randomEvent.stat_effects = JSON.parse(randomEvent.stat_effects || '{}'); } catch { randomEvent.stat_effects = {}; }
        }
      } catch(e) { console.error('Dashboard 随机事件查询失败:', e.message); }
      
      // AI洞见
      let aiInsight = null;
      try {
        const recentMood = db.prepare("SELECT emotion_tag, AVG(intensity) as avg_intensity FROM emotion_logs WHERE user_id = ? AND created_at >= datetime('now','-7 days') GROUP BY emotion_tag ORDER BY avg_intensity DESC LIMIT 1").get(user.id);
        const weakDim = db.prepare('SELECT ld.name, ld.icon FROM life_dimensions ld WHERE ld.id = (SELECT dimension_id FROM check_ins WHERE user_id = ? GROUP BY dimension_id ORDER BY COUNT(*) ASC LIMIT 1)').get(user.id);
        if (recentMood || weakDim) {
          aiInsight = { mood: recentMood?.emotion_tag || 'neutral', weakDimension: weakDim?.name || '未知', weakIcon: weakDim?.icon || '❓' };
        }
      } catch(e) { console.error('Dashboard AI洞见查询失败:', e.message); }
      
      res.json({
        user, todayTasks, todayCheckins: todayCheckins.count,
        recentAchievements, streak: streakInfo, dimensionStats,
        finance, randomEvent, aiInsight
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  
  // 全局错误处理：脱敏 + 日志
  app.use((err, req, res, _next) => {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
    const isDev = process.env.NODE_ENV === 'development';
    res.status(err.status || 500).json({
      error: isDev ? err.message : '服务器内部错误，请稍后重试'
    });
  });

  // SPA fallback: 非 API 返回前端页面，API 路径返回 404
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
    } else {
      res.status(404).json({ error: '接口不存在', path: req.path });
    }
  });
  
  // Load AI config from database
  const { getDb, createDbWrapper } = await import('./db/init.js');
  const rawDb = getDb();
  const w = createDbWrapper(rawDb);
  try {
    const cfg = w.prepare('SELECT * FROM ai_config LIMIT 1').get();
    if (cfg && cfg.api_key) {
      // 库中存的是密文，必须先解密再喂给 AI 引擎
      const { decryptApiKey } = await import('./routes/ai-config.js');
      const plainKey = decryptApiKey(cfg.api_key);
      if (plainKey) {
        setAiConfig({ provider: cfg.provider, apiKey: plainKey, model: cfg.model });
        console.log('✅ AI 配置已加载');
      } else {
        console.error('❌ API Key 解密失败（密钥不匹配或数据损坏），请在设置页重新填写');
      }
    } else {
      console.warn('⚠️ AI 配置为空，请先配置 API Key');
    }
  } catch (e) {
    console.error('❌ AI 配置加载失败:', e.message);
  }

  process.on('SIGINT', () => { saveDbImmediate(); process.exit(0); });
  process.on('SIGTERM', () => { saveDbImmediate(); process.exit(0); });
  process.on('uncaughtException', (err) => {
    console.error('💥 未捕获异常，紧急落盘:', err.message);
    saveDbImmediate();
    setTimeout(() => process.exit(1), 1000);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('⚠️ 未处理的 Promise 拒绝:', reason);
    saveDbImmediate();
  });

  app.listen(PORT, async () => {
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
    
    // 启动神经协调器（每15分钟一次完整循环）
    try {
      const { getDb, createDbWrapper } = await import('./db/init.js');
      const neuralDb = createDbWrapper(getDb());
      const neuralCoordinator = startNeuralCoordinator(neuralDb);
      console.log('🧬 神经协调器已激活');
    } catch(e) { console.error('神经协调器启动失败:', e.message); }
    
    // 启动概念图同步（每15分钟）
    setInterval(async () => {
      try {
        const user = getDb().prepare('SELECT id FROM users LIMIT 1').get();
        if (user) syncConceptToStats(user.id);
      } catch (e) { console.error('概念图同步失败:', e.message); }
    }, 15 * 60_000);
    
    // 初始化微信服务
    wechatService.setDb(createDbWrapper(getDb()));
    
    // 尝试微信自动重连（冷启动恢复）
    try {
      const { tryAutoReconnect } = await import('./services/gewechat-service.js');
      const reconnected = await tryAutoReconnect();
      if (reconnected) console.log('🔗 微信通道自动重连成功');
    } catch (e) { console.error('微信自动重连失败:', e.message); }
    
    // 每分钟检查是否需要发送微信提醒
    setInterval(async () => {
      try {
        await wechatService.dailyReminderCheck(createDbWrapper(getDb()));
      } catch (e) { console.error('微信提醒检查失败:', e.message); }
    }, 60000);

    // 启动主动触发引擎（时间+数据驱动的主动对话）
    try {
      startProactiveEngine();
      console.log('🚀 主动触发引擎已启动（早间问候/晚间复盘/里程碑激励/闲置关怀）');
    } catch (e) { console.error('主动引擎启动失败:', e.message); }

    // 系统自愈：关键模块崩溃自动重启
    setupSelfHealing();

    // 初始化情绪表（深度情感引擎）
    try {
      initEmotionEngine(getDb());
      console.log('💗 情绪表已初始化');
    } catch (e) { console.error('情绪表初始化失败:', e.message); }

    // 注册 Function Calling 工具执行器
    registerToolExecutors();

    // 启动外部数据拉取（天气 + 基金行情，每30分钟）
    try {
      startExternalDataPolling();
      console.log('🌤️ 外部数据感知已启动（天气/基金行情/30min轮询）');
    } catch (e) { console.error('外部数据拉取启动失败:', e.message); }

    // 启动意识循环（每12分钟：感知→反思→意图→成长）
    try {
      startConsciousnessLoop();
      console.log('🧘 意识循环已启动（12min/轮 | 感知→反思→意图→成长）');
    } catch (e) { console.error('意识循环启动失败:', e.message); }

    // 每30分钟自动同步土豆记账数据
    setInterval(async () => {
      try {
        const resp = await fetch('http://127.0.0.1:3000/api/finance/sync');
        const data = await resp.json();
        if (data.synced > 0) {
          console.log(`💰 财务同步: ${data.synced}条记录, 本月结余 ¥${data.month.net.toFixed(2)}`);
        }
      } catch (e) { console.error('定时财务同步失败(记账服务可能未启动):', e.message); }
    }, 1800000); // 30分钟
    
    // 启动后立即同步一次
    setTimeout(async () => {
      try {
        const resp = await fetch('http://127.0.0.1:3000/api/finance/sync');
        await resp.json();
      } catch (e) { console.error('启动财务同步失败:', e.message); }
    }, 10000);
  });
}

start().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
