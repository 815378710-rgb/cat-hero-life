import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { chatWithLLM, isAiEnabled } from '../services/ai-engine.js';

const router = Router();

// ===== 周/月自动规划 =====

// 生成周计划
router.post('/weekly/generate', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    
    const today = new Date();
    const weekStart = new Date(today - today.getDay() * 86400000).toISOString().split('T')[0];
    const weekEnd = new Date(today.getTime() + (6 - today.getDay()) * 86400000).toISOString().split('T')[0];
    
    // 检查是否已有周计划
    const existing = db.prepare("SELECT id FROM periodic_plans WHERE user_id = ? AND plan_type = 'weekly' AND period_start = ?").get(user.id, weekStart);
    if (existing) return res.json({ success: false, message: '本周计划已存在' });
    
    // 获取上周完成情况
    const lastWeekStart = new Date(today.getTime() - 7 * 86400000 - today.getDay() * 86400000).toISOString().split('T')[0];
    const lastWeekTasks = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed FROM tasks WHERE user_id = ? AND scheduled_date BETWEEN ? AND ?").get(user.id, lastWeekStart, weekStart);
    
    let weekGoals;
    if (isAiEnabled()) {
      const dims = ['health','finance','learning','career','social','mental','habits','creativity'];
      const stats = dims.map(d => `${d}:${user['stat_'+d]}`).join(', ');
      
      weekGoals = await chatWithLLM([
        { role: 'system', content: `你是猫猫侠的规划引擎。为用户生成本周计划。

用户属性：${stats}
上周任务完成率：${lastWeekTasks.total > 0 ? Math.round(lastWeekTasks.completed / lastWeekTasks.total * 100) : 0}%
职业：${profile?.current_job || '未知'}
当前挑战：${safeJoin(profile?.current_challenges)}

生成3-5个本周目标，JSON数组：
[{"dimension":"health","title":"目标标题","description":"具体做什么","target_count":5}]

只返回JSON。` },
        { role: 'user', content: '生成本周计划' }
      ], { temperature: 0.8, maxTokens: 500 });
    }
    
    if (!weekGoals) {
      const weakest = ['health','finance','learning','career','social','mental','habits','creativity']
        .map(d => ({ dim: d, val: user['stat_'+d] }))
        .sort((a, b) => a.val - b.val)
        .slice(0, 3);
      weekGoals = JSON.stringify(weakest.map(w => ({
        dimension: w.dim,
        title: `${w.dim}提升`,
        description: `在${w.dim}维度每天做一件事`,
        target_count: 5
      })));
    } else {
      const jsonMatch = weekGoals.match(/\[[\s\S]*\]/);
      if (jsonMatch) weekGoals = jsonMatch[0];
    }
    
    const id = uuid();
    db.prepare("INSERT INTO periodic_plans (id, user_id, plan_type, period_start, period_end, goals) VALUES (?, ?, 'weekly', ?, ?, ?)")
      .run(id, user.id, weekStart, weekEnd, weekGoals);
    
    res.json({ success: true, id, goals: JSON.parse(weekGoals), message: '本周计划已生成~ 📅' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取当前周/月计划
router.get('/:type/current', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];
    const plan = db.prepare("SELECT * FROM periodic_plans WHERE user_id = ? AND plan_type = ? AND status = 'active' AND period_start <= ? AND period_end >= ? ORDER BY created_at DESC LIMIT 1")
      .get(user.id, req.params.type, today, today);
    
    if (plan) {
      plan.goals = JSON.parse(plan.goals || '[]');
    }
    
    res.json({ plan });
  } catch (e) { res.json({ plan: null }); }
});

// ===== 天气联动 =====

router.get('/weather', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT city FROM life_profile WHERE user_id = ?').get(user.id);
    const city = profile?.city || req.query.city || '上海';
    
    // 检查缓存
    const cached = db.prepare("SELECT * FROM weather_cache WHERE city = ? AND cached_at > datetime('now', '-3 hours') ORDER BY cached_at DESC LIMIT 1").get(city);
    
    if (cached) {
      return res.json({ weather: JSON.parse(cached.weather_data), cached: true });
    }
    
    // 获取天气（使用wttr.in免费API）
    try {
      const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      const current = data.current_condition?.[0];
      
      const weather = {
        city,
        temp: current?.temp_C,
        feelsLike: current?.FeelsLikeC,
        description: current?.weatherDesc?.[0]?.value,
        humidity: current?.humidity,
        windSpeed: current?.windspeedKmph,
        isRainy: parseInt(current?.rainMM || '0') > 0 || current?.weatherDesc?.[0]?.value?.includes('rain'),
        isCold: parseInt(current?.temp_C || '20') < 10,
        isHot: parseInt(current?.temp_C || '20') > 35,
      };
      
      // 缓存
      db.prepare("INSERT INTO weather_cache (city, weather_data) VALUES (?, ?)").run(city, JSON.stringify(weather));
      
      res.json({ weather, cached: false });
    } catch {
      res.json({ weather: { city, description: '未知', temp: null }, cached: false, error: '天气获取失败' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 猫猫侠成长系统 =====

// 获取猫猫侠状态
router.get('/cat/status', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    let cat = db.prepare('SELECT * FROM cat_growth WHERE user_id = ?').get(user.id);
    
    if (!cat) {
      const id = uuid();
      db.prepare("INSERT INTO cat_growth (id, user_id, first_meet_date, last_interaction) VALUES (?, ?, date('now'), datetime('now'))").run(id, user.id);
      cat = db.prepare('SELECT * FROM cat_growth WHERE id = ?').get(id);
    }
    
    // 计算能力
    const abilities = getAbilities(cat.cat_level);
    
    res.json({ ...cat, abilities, unlocked_abilities: JSON.parse(cat.unlocked_abilities || '[]') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 猫猫侠获得经验
router.post('/cat/exp', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { amount, reason } = req.body;
    
    let cat = db.prepare('SELECT * FROM cat_growth WHERE user_id = ?').get(user.id);
    if (!cat) {
      const id = uuid();
      db.prepare("INSERT INTO cat_growth (id, user_id, first_meet_date) VALUES (?, ?, date('now'))").run(id, user.id);
      cat = db.prepare('SELECT * FROM cat_growth WHERE id = ?').get(id);
    }
    
    const expGain = amount || 5;
    let newExp = cat.cat_exp + expGain;
    let newLevel = cat.cat_level;
    
    while (newExp >= getCatExpForLevel(newLevel + 1)) {
      newExp -= getCatExpForLevel(newLevel + 1);
      newLevel++;
    }
    
    const levelUp = newLevel > cat.cat_level;
    const newAbilities = levelUp ? getAbilities(newLevel) : [];
    
    db.prepare("UPDATE cat_growth SET cat_level = ?, cat_exp = ?, total_interactions = total_interactions + 1, last_interaction = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      .run(newLevel, newExp, cat.id);
    
    if (levelUp) {
      db.prepare("UPDATE cat_growth SET unlocked_abilities = ? WHERE id = ?")
        .run(JSON.stringify([...JSON.parse(cat.unlocked_abilities || '[]'), ...newAbilities]), cat.id);
    }
    
    res.json({ 
      success: true, 
      exp: expGain, 
      level: newLevel, 
      levelUp,
      newAbilities,
      message: levelUp ? `🎉 猫猫侠升级到 Lv.${newLevel}！新能力解锁：${newAbilities.join('、')}` : `+${expGain}经验`
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function getCatExpForLevel(level) {
  return Math.floor(50 * Math.pow(1.2, level - 1));
}

function getAbilities(level) {
  const table = {
    1: ['基础对话'],
    2: ['情绪感知'],
    3: ['任务管理'],
    5: ['记忆系统'],
    8: ['人生规划'],
    10: ['数据分析'],
    13: ['叙事能力'],
    15: ['主动关怀'],
    20: ['深度洞察'],
    25: ['预知能力'],
    30: ['人生智慧'],
  };
  
  const abilities = [];
  for (const [lvl, ability] of Object.entries(table)) {
    if (level >= parseInt(lvl)) abilities.push(...ability);
  }
  return abilities;
}

function safeJoin(jsonStr) {
  try { const arr = JSON.parse(jsonStr); return Array.isArray(arr) ? arr.join('、') : ''; } catch { return ''; }
}

export default router;
