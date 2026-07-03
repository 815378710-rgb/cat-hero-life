import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getPersonalizedRecommendations } from '../services/life-engine.js';

const router = Router();

// ==========================================
// 通用CRUD工厂
// ==========================================

function createCrudRoutes(tableName, allowedFields) {
  const routes = Router();

  // 列表
  routes.get('/', (req, res) => {
    const db = req.db;
    try {
      const user = db.prepare('SELECT id FROM users LIMIT 1').get();
      const { limit, offset, order } = req.query;
      const rows = db.prepare(`SELECT * FROM ${tableName} WHERE user_id = ? ORDER BY ${order || 'created_at DESC'} LIMIT ? OFFSET ?`)
        .all(user.id, parseInt(limit) || 50, parseInt(offset) || 0);
      const total = db.prepare(`SELECT COUNT(*) as c FROM ${tableName} WHERE user_id = ?`).get(user.id);
      res.json({ data: rows, total: total.c });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 创建
  routes.post('/', (req, res) => {
    const db = req.db;
    try {
      const user = db.prepare('SELECT id FROM users LIMIT 1').get();
      const id = uuid();
      const fields = ['id', 'user_id', ...allowedFields];
      const values = [id, user.id];
      
      for (const f of allowedFields) {
        const val = req.body[f];
        values.push(val === undefined ? null : (typeof val === 'object' ? JSON.stringify(val) : val));
      }
      
      const placeholders = fields.map(() => '?').join(', ');
      db.prepare(`INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders})`).run(...values);
      
      res.json({ success: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 更新
  routes.put('/:id', (req, res) => {
    const db = req.db;
    try {
      const updates = [];
      const params = [];
      for (const f of allowedFields) {
        if (req.body[f] !== undefined) {
          updates.push(`${f} = ?`);
          params.push(typeof req.body[f] === 'object' ? JSON.stringify(req.body[f]) : req.body[f]);
        }
      }
      if (updates.length === 0) return res.json({ success: true });
      
      params.push(req.params.id);
      db.prepare(`UPDATE ${tableName} SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除
  routes.delete('/:id', (req, res) => {
    const db = req.db;
    try {
      db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(req.params.id);
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return routes;
}

// ==========================================
// 健康维度
// ==========================================

router.use('/health/body', createCrudRoutes('health_body', ['record_date', 'weight_kg', 'height_cm', 'bmi', 'body_fat_percent', 'muscle_mass_kg', 'waist_cm', 'blood_pressure_sys', 'blood_pressure_dia', 'heart_rate', 'blood_sugar', 'temperature', 'note']));

router.use('/health/sleep', createCrudRoutes('health_sleep', ['sleep_date', 'bedtime', 'wake_time', 'duration_hours', 'quality', 'deep_sleep_hours', 'dreams', 'note']));

router.use('/health/exercise', createCrudRoutes('health_exercise', ['exercise_date', 'exercise_type', 'duration_minutes', 'calories_burned', 'distance_km', 'intensity', 'heart_rate_avg', 'note']));

router.use('/health/diet', createCrudRoutes('health_diet', ['diet_date', 'meal_type', 'food_description', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'water_ml', 'mood_after']));

router.use('/health/medical', createCrudRoutes('health_medical', ['record_type', 'title', 'description', 'doctor', 'hospital', 'date', 'next_date', 'is_active']));

// 健康仪表盘
router.get('/health/dashboard', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    
    // 最新身体指标
    const latestBody = db.prepare('SELECT * FROM health_body WHERE user_id = ? ORDER BY record_date DESC LIMIT 1').get(user.id);
    
    // 本周睡眠
    const sleepStats = db.prepare('SELECT AVG(duration_hours) as avg_hours, AVG(quality) as avg_quality FROM health_sleep WHERE user_id = ? AND sleep_date >= ?').get(user.id, weekAgo);
    
    // 本周运动
    const exerciseStats = db.prepare('SELECT COUNT(*) as count, SUM(duration_minutes) as total_minutes, SUM(calories_burned) as total_calories FROM health_exercise WHERE user_id = ? AND exercise_date >= ?').get(user.id, weekAgo);
    
    // 今日饮水
    const todayWater = db.prepare('SELECT SUM(water_ml) as total FROM health_diet WHERE user_id = ? AND diet_date = ?').get(user.id, today);
    
    // 今日热量
    const todayCalories = db.prepare('SELECT SUM(calories) as total FROM health_diet WHERE user_id = ? AND diet_date = ?').get(user.id, today);
    
    // 医疗提醒
    const upcomingMedical = db.prepare("SELECT * FROM health_medical WHERE user_id = ? AND is_active = 1 AND next_date IS NOT NULL AND next_date >= ? ORDER BY next_date LIMIT 5").all(user.id, today);
    
    res.json({
      body: latestBody,
      sleep: { avg_hours: sleepStats.avg_hours ? Math.round(sleepStats.avg_hours * 10) / 10 : null, avg_quality: sleepStats.avg_quality ? Math.round(sleepStats.avg_quality * 10) / 10 : null },
      exercise: { count: exerciseStats.count, total_minutes: exerciseStats.total_minutes, total_calories: exerciseStats.total_calories },
      water_ml: todayWater.total || 0,
      calories: todayCalories.total || 0,
      medical_reminders: upcomingMedical
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 财务维度
// ==========================================

router.use('/finance/transactions', createCrudRoutes('finance_transactions', ['transaction_date', 'type', 'category', 'amount', 'description', 'payment_method', 'is_recurring']));

router.use('/finance/accounts', createCrudRoutes('finance_accounts', ['account_name', 'account_type', 'balance', 'currency']));

router.use('/finance/investments', createCrudRoutes('finance_investments', ['investment_type', 'name', 'amount_invested', 'current_value', 'return_rate', 'purchase_date', 'note']));

router.use('/finance/budgets', createCrudRoutes('finance_budgets', ['category', 'monthly_limit', 'month', 'spent']));

// 财务仪表盘
router.get('/finance/dashboard', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const today = new Date();
    const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = today.getMonth() === 0 
      ? `${today.getFullYear() - 1}-12` 
      : `${today.getFullYear()}-${String(today.getMonth()).padStart(2, '0')}`;
    
    // 本月收支
    const monthIncome = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE user_id = ? AND type = 'income' AND transaction_date LIKE ?").get(user.id, thisMonth + '%');
    const monthExpense = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE user_id = ? AND type = 'expense' AND transaction_date LIKE ?").get(user.id, thisMonth + '%');
    
    // 支出分类
    const expenseByCategory = db.prepare("SELECT category, SUM(amount) as total FROM finance_transactions WHERE user_id = ? AND type = 'expense' AND transaction_date LIKE ? GROUP BY category ORDER BY total DESC").all(user.id, thisMonth + '%');
    
    // 账户余额
    const accounts = db.prepare('SELECT * FROM finance_accounts WHERE user_id = ?').all(user.id);
    const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0);
    
    // 投资
    const investments = db.prepare('SELECT * FROM finance_investments WHERE user_id = ?').all(user.id);
    const totalInvested = investments.reduce((s, i) => s + (i.amount_invested || 0), 0);
    const totalCurrentValue = investments.reduce((s, i) => s + (i.current_value || 0), 0);
    
    // 预算执行
    const budgets = db.prepare('SELECT * FROM finance_budgets WHERE user_id = ? AND month = ?').all(user.id, thisMonth);
    
    // 储蓄率
    const savingRate = monthIncome.total > 0 ? Math.round(((monthIncome.total - (monthExpense.total || 0)) / monthIncome.total) * 100) : 0;
    
    res.json({
      month: thisMonth,
      income: monthIncome.total || 0,
      expense: monthExpense.total || 0,
      saving_rate: savingRate,
      expense_by_category: expenseByCategory,
      total_balance: totalBalance,
      accounts,
      investments: { total_invested: totalInvested, current_value: totalCurrentValue, return_rate: totalInvested > 0 ? Math.round(((totalCurrentValue - totalInvested) / totalInvested) * 100) : 0 },
      budgets
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 学习维度
// ==========================================

router.use('/learning/skills', createCrudRoutes('learning_skills', ['skill_name', 'category', 'proficiency', 'target_proficiency', 'hours_invested', 'is_learning']));

router.use('/learning/logs', createCrudRoutes('learning_logs', ['log_date', 'skill_id', 'activity_type', 'content_description', 'duration_minutes', 'notes']));

router.use('/learning/resources', createCrudRoutes('learning_resources', ['resource_type', 'title', 'author', 'category', 'status', 'progress_percent', 'start_date', 'completion_date', 'rating', 'notes']));

// 学习仪表盘
router.get('/learning/dashboard', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    
    const skills = db.prepare('SELECT * FROM learning_skills WHERE user_id = ? AND is_learning = 1 ORDER BY proficiency DESC').all(user.id);
    const weekHours = db.prepare('SELECT SUM(duration_minutes) as total FROM learning_logs WHERE user_id = ? AND log_date >= ?').get(user.id, weekAgo);
    const resources = db.prepare("SELECT * FROM learning_resources WHERE user_id = ? AND status = 'reading'").all(user.id);
    const completedResources = db.prepare("SELECT COUNT(*) as c FROM learning_resources WHERE user_id = ? AND status = 'completed'").get(user.id);
    
    res.json({
      skills,
      week_hours: weekHours.total ? Math.round(weekHours.total / 60 * 10) / 10 : 0,
      active_resources: resources,
      completed_count: completedResources.c
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 职业维度
// ==========================================

router.use('/career/experience', createCrudRoutes('career_experience', ['company', 'position', 'industry', 'start_date', 'end_date', 'salary', 'description', 'achievements', 'is_current']));

router.use('/career/goals', createCrudRoutes('career_goals', ['goal_type', 'title', 'description', 'target_date', 'action_plan', 'progress', 'status']));

router.use('/career/network', createCrudRoutes('career_network', ['name', 'relationship', 'company', 'position', 'contact_info', 'last_contact_date', 'contact_frequency', 'notes']));

// ==========================================
// 社交维度
// ==========================================

router.use('/social/relationships', createCrudRoutes('social_relationships', ['name', 'relationship_type', 'closeness', 'last_contact', 'contact_frequency', 'birthday', 'notes']));

router.use('/social/activities', createCrudRoutes('social_activities', ['activity_date', 'activity_type', 'people_involved', 'description', 'duration_minutes', 'enjoyment']));

// 社交仪表盘
router.get('/social/dashboard', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    
    const relationships = db.prepare('SELECT * FROM social_relationships WHERE user_id = ? ORDER BY closeness DESC').all(user.id);
    const weekActivities = db.prepare('SELECT COUNT(*) as c FROM social_activities WHERE user_id = ? AND activity_date >= ?').get(user.id, weekAgo);
    const byType = db.prepare('SELECT relationship_type, COUNT(*) as count FROM social_relationships WHERE user_id = ? GROUP BY relationship_type').all(user.id);
    
    res.json({
      total_relationships: relationships.length,
      by_type: byType,
      week_activities: weekActivities.c,
      close_friends: relationships.filter(r => r.closeness >= 4).length,
      needs_contact: relationships.filter(r => {
        if (!r.last_contact) return true;
        const days = Math.floor((Date.now() - new Date(r.last_contact)) / 86400000);
        return days > 30;
      }).slice(0, 5)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 心理维度
// ==========================================

router.use('/mental/mood', createCrudRoutes('mental_mood_diary', ['diary_date', 'mood_score', 'mood_tags', 'energy_level', 'stress_level', 'trigger_events', 'coping_methods', 'gratitude', 'reflection']));

router.use('/mental/meditation', createCrudRoutes('mental_meditation', ['meditation_date', 'duration_minutes', 'meditation_type', 'quality', 'notes']));

// 心理仪表盘
router.get('/mental/dashboard', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    
    const weekMoods = db.prepare('SELECT AVG(mood_score) as avg_mood, AVG(stress_level) as avg_stress, AVG(energy_level) as avg_energy FROM mental_mood_diary WHERE user_id = ? AND diary_date >= ?').get(user.id, weekAgo);
    const monthMoods = db.prepare('SELECT diary_date, mood_score FROM mental_mood_diary WHERE user_id = ? AND diary_date >= ? ORDER BY diary_date').all(user.id, monthAgo);
    const weekMeditation = db.prepare('SELECT COUNT(*) as count, SUM(duration_minutes) as total_minutes FROM mental_meditation WHERE user_id = ? AND meditation_date >= ?').get(user.id, weekAgo);
    const latestGratitude = db.prepare("SELECT gratitude FROM mental_mood_diary WHERE user_id = ? AND gratitude IS NOT NULL AND gratitude != '' ORDER BY diary_date DESC LIMIT 3").all(user.id);
    
    res.json({
      week: {
        avg_mood: weekMoods.avg_mood ? Math.round(weekMoods.avg_mood * 10) / 10 : null,
        avg_stress: weekMoods.avg_stress ? Math.round(weekMoods.avg_stress * 10) / 10 : null,
        avg_energy: weekMoods.avg_energy ? Math.round(weekMoods.avg_energy * 10) / 10 : null
      },
      month_trend: monthMoods,
      meditation: { count: weekMeditation.count, total_minutes: weekMeditation.total_minutes },
      recent_gratitude: latestGratitude.map(g => g.gratitude)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 创造维度
// ==========================================

router.use('/creative/projects', createCrudRoutes('creative_projects', ['project_name', 'project_type', 'description', 'status', 'progress', 'start_date', 'target_date', 'hours_invested']));

router.use('/creative/ideas', createCrudRoutes('creative_ideas', ['idea_text', 'category', 'priority', 'status', 'related_project_id']));

router.use('/creative/outputs', createCrudRoutes('creative_outputs', ['output_type', 'title', 'description', 'url', 'project_id']));

// ==========================================
// 生活平衡轮（真实得分计算）
// ==========================================

router.get('/balance-wheel', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    
    // 健康得分
    const sleep = db.prepare('SELECT AVG(quality) as q FROM health_sleep WHERE user_id = ? AND sleep_date >= ?').get(user.id, weekAgo);
    const exercise = db.prepare('SELECT COUNT(*) as c FROM health_exercise WHERE user_id = ? AND exercise_date >= ?').get(user.id, weekAgo);
    const healthScore = Math.round(((sleep.q || 3) / 5 * 40 + Math.min(exercise.c, 7) / 7 * 40 + (user.stat_health / 100) * 20));
    
    // 财务得分
    const finance = db.prepare("SELECT SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income, SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense FROM finance_transactions WHERE user_id = ? AND transaction_date >= ?").get(user.id, weekAgo);
    const savingRate = finance.income > 0 ? (finance.income - (finance.expense || 0)) / finance.income : 0;
    const financeScore = Math.round((Math.min(savingRate, 0.3) / 0.3 * 50 + (user.stat_finance / 100) * 50));
    
    // 学习得分
    const learning = db.prepare('SELECT SUM(duration_minutes) as m FROM learning_logs WHERE user_id = ? AND log_date >= ?').get(user.id, weekAgo);
    const learningScore = Math.round((Math.min((learning.m || 0) / 300, 1) * 50 + (user.stat_learning / 100) * 50));
    
    // 其他维度用现有属性值
    const scores = {
      health: Math.min(100, healthScore),
      finance: Math.min(100, financeScore || user.stat_finance),
      learning: Math.min(100, learningScore || user.stat_learning),
      career: user.stat_career,
      social: user.stat_social,
      mental: user.stat_mental,
      habits: user.stat_habits,
      creativity: user.stat_creativity
    };
    
    const total = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) / 8);
    
    res.json({ scores, average: total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 智能预警系统
// ==========================================

router.get('/alerts', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const alerts = [];
    
    // 体重趋势
    const weightTrend = db.prepare('SELECT weight_kg FROM health_body WHERE user_id = ? ORDER BY record_date DESC LIMIT 7').all(user.id);
    if (weightTrend.length >= 3) {
      const avg = weightTrend.reduce((s, w) => s + w.weight_kg, 0) / weightTrend.length;
      const latest = weightTrend[0].weight_kg;
      if (latest > avg * 1.03) alerts.push({ type: 'warning', dimension: 'health', message: `体重连续上升，最近${latest}kg，比均值高${Math.round((latest/avg-1)*100)}%` });
    }
    
    // 睡眠不足
    const recentSleep = db.prepare('SELECT AVG(duration_hours) as avg FROM health_sleep WHERE user_id = ? AND sleep_date >= ?').get(user.id, weekAgo);
    if (recentSleep.avg && recentSleep.avg < 6) alerts.push({ type: 'danger', dimension: 'health', message: `近一周平均睡眠仅${recentSleep.avg.toFixed(1)}小时，严重不足！` });
    
    // 情绪低落
    const recentMood = db.prepare('SELECT AVG(mood_score) as avg FROM mental_mood_diary WHERE user_id = ? AND diary_date >= ?').get(user.id, weekAgo);
    if (recentMood.avg && recentMood.avg < 2.5) alerts.push({ type: 'warning', dimension: 'mental', message: '近一周情绪持续低落，需要关注心理健康' });
    
    // 财务超支
    const month = today.slice(0, 7);
    const budgets = db.prepare('SELECT * FROM finance_budgets WHERE user_id = ? AND month = ?').all(user.id, month);
    for (const b of budgets) {
      const spent = db.prepare("SELECT SUM(amount) as s FROM finance_transactions WHERE user_id = ? AND type = 'expense' AND category = ? AND transaction_date LIKE ?").get(user.id, b.category, month + '%');
      if (spent.s && spent.s > b.monthly_limit * 0.8) alerts.push({ type: 'warning', dimension: 'finance', message: `${b.category}支出已达预算的${Math.round(spent.s/b.monthly_limit*100)}%` });
    }
    
    // 连续签到风险
    if (user.consecutive_sign_days >= 7 && user.last_sign_date !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (user.last_sign_date !== yesterday) alerts.push({ type: 'danger', dimension: 'habits', message: `连续${user.consecutive_sign_days}天签到即将中断！快来签到~` });
    }
    
    // 负债提醒
    const debts = db.prepare("SELECT * FROM finance_accounts WHERE user_id = ? AND balance < 0").all(user.id);
    if (debts.length > 0) alerts.push({ type: 'info', dimension: 'finance', message: `有${debts.length}个账户负债，注意还款` });
    
    // 医疗提醒
    const upcomingMedical = db.prepare("SELECT * FROM health_medical WHERE user_id = ? AND is_active = 1 AND next_date IS NOT NULL AND next_date <= date(?, '+7 days')").all(user.id, today);
    for (const m of upcomingMedical) alerts.push({ type: 'info', dimension: 'health', message: `医疗提醒：${m.title}，复查日期${m.next_date}` });
    
    res.json({ alerts, count: alerts.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 人生时间轴
// ==========================================

router.get('/timeline', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { limit, days } = req.query;
    const since = new Date(Date.now() - (parseInt(days) || 30) * 86400000).toISOString();
    
    const events = [];
    
    // 任务完成
    const tasks = db.prepare("SELECT title, completed_at, dimension_id FROM tasks WHERE user_id = ? AND status = 'completed' AND completed_at > ? ORDER BY completed_at DESC").all(user.id, since);
    for (const t of tasks) events.push({ type: 'task', title: `完成任务: ${t.title}`, time: t.completed_at, icon: '✅', dimension: t.dimension_id });
    
    // 打卡
    const checkins = db.prepare("SELECT title, checked_at, dimension_id FROM check_ins WHERE user_id = ? AND checked_at > ? ORDER BY checked_at DESC").all(user.id, since);
    for (const c of checkins) events.push({ type: 'checkin', title: `打卡: ${c.title}`, time: c.checked_at, icon: '📌', dimension: c.dimension_id });
    
    // 成就
    const achievements = db.prepare("SELECT a.name, a.icon, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON ua.achievement_id = a.id WHERE ua.user_id = ? AND ua.unlocked_at > ?").all(user.id, since);
    for (const a of achievements) events.push({ type: 'achievement', title: `解锁成就: ${a.name}`, time: a.unlocked_at, icon: a.icon });
    
    // 叙事
    const chapters = db.prepare("SELECT chapter_title, created_at FROM life_narrative WHERE user_id = ? AND created_at > ?").all(user.id, since);
    for (const c of chapters) events.push({ type: 'narrative', title: `叙事: ${c.chapter_title}`, time: c.created_at, icon: '📖' });
    
    // 情绪
    const moods = db.prepare("SELECT mood_score, diary_date, trigger_events FROM mental_mood_diary WHERE user_id = ? AND diary_date > ?").all(user.id, since.split('T')[0]);
    for (const m of moods) events.push({ type: 'mood', title: `情绪: ${m.mood_score}/5${m.trigger_events ? ' - ' + m.trigger_events : ''}`, time: m.diary_date, icon: ['😶','😢','😐','🙂','😊'][m.mood_score - 1] || '🎭' });
    
    // 排序
    events.sort((a, b) => new Date(b.time) - new Date(a.time));
    
    res.json({ events: events.slice(0, parseInt(limit) || 100) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 年度报告
// ==========================================

router.get('/annual-report', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const year = req.query.year || new Date().getFullYear().toString();
    const yearStart = year + '-01-01';
    const yearEnd = year + '-12-31';
    
    const totalTasks = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed FROM tasks WHERE user_id = ? AND scheduled_date BETWEEN ? AND ?").get(user.id, yearStart, yearEnd);
    const totalCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND checked_at BETWEEN ? AND ?").get(user.id, yearStart + ' 00:00:00', yearEnd + ' 23:59:59');
    const achievements = db.prepare("SELECT COUNT(*) as c FROM user_achievements WHERE user_id = ? AND unlocked_at BETWEEN ? AND ?").get(user.id, yearStart, yearEnd);
    const chapters = db.prepare("SELECT COUNT(*) as c FROM life_narrative WHERE user_id = ? AND created_at BETWEEN ? AND ?").get(user.id, yearStart, yearEnd);
    
    const monthCheckins = db.prepare("SELECT strftime('%m', checked_at) as month, COUNT(*) as count FROM check_ins WHERE user_id = ? AND checked_at BETWEEN ? AND ? GROUP BY month ORDER BY month").all(user.id, yearStart + ' 00:00:00', yearEnd + ' 23:59:59');
    
    res.json({
      year,
      tasks: totalTasks,
      checkins: totalCheckins.c,
      achievements: achievements.c,
      chapters: chapters.c,
      monthly_checkins: monthCheckins,
      level: user.level,
      total_exp: user.total_exp
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;

// ==========================================
// 趋势分析
// ==========================================

router.get('/trends/:dimension', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { dimension } = req.params;
    const { days } = req.query;
    const limit = parseInt(days) || 30;
    const startDate = new Date(Date.now() - limit * 86400000).toISOString().split('T')[0];
    
    let trend = {};
    
    switch (dimension) {
      case 'health':
        const weight = db.prepare('SELECT record_date, weight_kg FROM health_body WHERE user_id = ? AND record_date >= ? ORDER BY record_date').all(user.id, startDate);
        const sleep = db.prepare('SELECT sleep_date, duration_hours, quality FROM health_sleep WHERE user_id = ? AND sleep_date >= ? ORDER BY sleep_date').all(user.id, startDate);
        const exercise = db.prepare('SELECT exercise_date, exercise_type, duration_minutes FROM health_exercise WHERE user_id = ? AND exercise_date >= ? ORDER BY exercise_date').all(user.id, startDate);
        trend = { weight, sleep, exercise };
        break;
      case 'finance':
        const income = db.prepare("SELECT strftime('%Y-%m', transaction_date) as month, SUM(amount) as total FROM finance_transactions WHERE user_id = ? AND type = 'income' AND transaction_date >= ? GROUP BY month ORDER BY month").all(user.id, startDate);
        const expense = db.prepare("SELECT strftime('%Y-%m', transaction_date) as month, SUM(amount) as total FROM finance_transactions WHERE user_id = ? AND type = 'expense' AND transaction_date >= ? GROUP BY month ORDER BY month").all(user.id, startDate);
        const byCategory = db.prepare("SELECT category, SUM(amount) as total FROM finance_transactions WHERE user_id = ? AND type = 'expense' AND transaction_date >= ? GROUP BY category ORDER BY total DESC").all(user.id, startDate);
        trend = { income, expense, byCategory };
        break;
      case 'mental':
        const moods = db.prepare('SELECT diary_date, mood_score, stress_level, energy_level FROM mental_mood_diary WHERE user_id = ? AND diary_date >= ? ORDER BY diary_date').all(user.id, startDate);
        trend = { moods };
        break;
      case 'learning':
        const logs = db.prepare('SELECT log_date, SUM(duration_minutes) as total FROM learning_logs WHERE user_id = ? AND log_date >= ? GROUP BY log_date ORDER BY log_date').all(user.id, startDate);
        trend = { logs };
        break;
      default:
        trend = { error: '未知维度' };
    }
    
    res.json({ dimension, period: limit, trend });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 数据关联分析
// ==========================================

router.get('/correlations', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    
    // 情绪 vs 运动
    const moodExercise = db.prepare(`
      SELECT m.mood_score, (SELECT COUNT(*) FROM health_exercise e WHERE e.user_id = m.user_id AND e.exercise_date = m.diary_date) as exercise_count
      FROM mental_mood_diary m WHERE m.user_id = ? AND m.diary_date >= ?
    `).all(user.id, weekAgo);
    
    // 情绪 vs 睡眠
    const moodSleep = db.prepare(`
      SELECT m.mood_score, (SELECT AVG(duration_hours) FROM health_sleep s WHERE s.user_id = m.user_id AND s.sleep_date = m.diary_date) as sleep_hours
      FROM mental_mood_diary m WHERE m.user_id = ? AND m.diary_date >= ?
    `).all(user.id, weekAgo);
    
    // 任务完成 vs 情绪
    const taskMood = db.prepare(`
      SELECT m.mood_score, (SELECT COUNT(*) FROM tasks t WHERE t.user_id = m.user_id AND t.scheduled_date = m.diary_date AND t.status = 'completed') as completed_tasks
      FROM mental_mood_diary m WHERE m.user_id = ? AND m.diary_date >= ?
    `).all(user.id, weekAgo);
    
    // 分析关联
    const insights = [];
    
    const avgMoodWithExercise = moodExercise.filter(m => m.exercise_count > 0);
    const avgMoodWithoutExercise = moodExercise.filter(m => m.exercise_count === 0);
    if (avgMoodWithExercise.length > 0 && avgMoodWithoutExercise.length > 0) {
      const withEx = avgMoodWithExercise.reduce((s, m) => s + m.mood_score, 0) / avgMoodWithExercise.length;
      const withoutEx = avgMoodWithoutExercise.reduce((s, m) => s + m.mood_score, 0) / avgMoodWithoutExercise.length;
      if (withEx > withoutEx + 0.5) insights.push({ type: 'positive', message: `运动和情绪正相关：运动时情绪${withEx.toFixed(1)}，不运动时${withoutEx.toFixed(1)}` });
    }
    
    res.json({ correlations: { moodExercise, moodSleep, taskMood }, insights });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 备份导入
// ==========================================

router.post('/import', (req, res) => {
  const db = req.db;
  try {
    const { data } = req.body;
    if (!data || !data.version) return res.status(400).json({ error: '无效的备份数据' });
    
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    let imported = { tasks: 0, memories: 0, checkins: 0 };
    
    // 导入任务
    if (data.tasks) {
      for (const t of data.tasks) {
        try {
          db.prepare('INSERT OR IGNORE INTO tasks (id, user_id, dimension_id, title, description, task_type, difficulty, exp_reward, coin_reward, scheduled_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(t.id, user.id, t.dimension_id, t.title, t.description, t.task_type, t.difficulty, t.exp_reward, t.coin_reward, t.scheduled_date, t.status || 'pending');
          imported.tasks++;
        } catch {}
      }
    }
    
    // 导入记忆
    if (data.memories) {
      for (const m of data.memories) {
        try {
          db.prepare('INSERT OR IGNORE INTO ai_memory (id, user_id, memory_type, title, content, summary, importance, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(m.id || uuid(), user.id, m.memory_type, m.title, m.content, m.summary, m.importance, m.source || 'import');
          imported.memories++;
        } catch {}
      }
    }
    
    // 导入打卡
    if (data.checkins) {
      for (const c of data.checkins) {
        try {
          db.prepare('INSERT OR IGNORE INTO check_ins (id, user_id, dimension_id, check_type, title, value, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(c.id || uuid(), user.id, c.dimension_id, c.check_type, c.title, c.value, c.checked_at);
          imported.checkins++;
        } catch {}
      }
    }
    
    res.json({ success: true, imported, message: `导入完成：任务${imported.tasks}个，记忆${imported.memories}条，打卡${imported.checkins}条` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ==========================================
// 个性化推荐
// ==========================================

router.get('/recommendations', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const recommendations = getPersonalizedRecommendations(db, user.id);
    res.json({ recommendations });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 数据隐私 - 掩盖敏感信息
// ==========================================

router.get('/privacy/export', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const data = {
      profile: db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id),
      tasks: db.prepare('SELECT title, status, scheduled_date FROM tasks WHERE user_id = ?').all(user.id),
      checkins: db.prepare('SELECT title, value, checked_at FROM check_ins WHERE user_id = ?').all(user.id),
      moods: db.prepare('SELECT diary_date, mood_score FROM mental_mood_diary WHERE user_id = ?').all(user.id),
    };
    
    // 掩盖敏感字段
    if (data.profile) {
      delete data.profile.id;
      delete data.profile.user_id;
    }
    
    res.json({ data, note: '已导出个人数据（已掩盖敏感信息）' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

