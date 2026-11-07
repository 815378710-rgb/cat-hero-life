// AI教练引擎 - 智能任务生成 + 习惯连锁检测 + 主动指导
const dimensionNames = { health: '健康', finance: '财务', learning: '学习', career: '职业', social: '社交', mental: '心理', habits: '习惯', creativity: '创造' };
const dimensionIcons = { health: '💪', finance: '💰', learning: '📚', career: '🚀', social: '🤝', mental: '🧠', habits: '🔄', creativity: '🎨' };

// 习惯连锁检测 - 发现"X→Y"的行为模式
export function detectHabitChains(db, userId) {
  const chains = [];
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  // 获取最近30天打卡数据
  const checkins = db.prepare(`
    SELECT date(checked_at) as date, dimension_id as category, COUNT(*) as count 
    FROM check_ins 
    WHERE user_id = ? AND date(checked_at) >= ?
    GROUP BY date(checked_at), dimension_id
    ORDER BY date(checked_at)
  `).all(userId, thirtyDaysAgo);

  // 按日期分组分析同一天内不同类别打卡的关系
  const dateMap = {};
  for (const c of checkins) {
    if (!dateMap[c.date]) dateMap[c.date] = new Set();
    dateMap[c.date].add(c.category);
  }

  // 检测连续2天以上的组合模式
  const sortedDates = Object.keys(dateMap).sort();
  const pairCount = {};

  for (let i = 0; i < sortedDates.length - 1; i++) {
    const today2 = dateMap[sortedDates[i]];
    const tomorrow = dateMap[sortedDates[i + 1]];
    if (!tomorrow) continue;

    // 昨天有A类别，今天有B类别
    for (const catA of today2) {
      for (const catB of tomorrow) {
        if (catA !== catB) {
          const key = `${catA}->${catB}`;
          pairCount[key] = (pairCount[key] || 0) + 1;
        }
      }
    }
  }

  // 筛选高频连锁（出现3次以上）
  for (const [key, count] of Object.entries(pairCount)) {
    if (count >= 3) {
      const [from, to] = key.split('->');
      chains.push({
        from, to, count,
        description: `当你完成「${dimensionNames[from]}」后，更有可能去完成「${dimensionNames[to]}」（${count}次）`
      });
    }
  }

  return chains;
}

// AI教练模式 - 根据用户状态生成建议
export function generateCoachAdvice(db, userId) {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { advice: '先创建你的账号吧~', priority: 'info', actions: [] };

  const todayCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(userId, today);
  const weekCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) >= ?").get(userId, weekAgo);
  const incompleteTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status != 'completed' AND scheduled_date <= ?").get(userId, today);
  const habits = db.prepare("SELECT name, current_streak FROM habits WHERE user_id = ? AND is_active = 1 ORDER BY current_streak DESC").all(userId);
  const inactiveHabits = db.prepare(`
    SELECT h.name, MAX(hl.logged_at) as last_logged 
    FROM habits h 
    LEFT JOIN habit_logs hl ON h.id = hl.habit_id 
    WHERE h.user_id = ? AND h.is_active = 1 
    GROUP BY h.id 
    HAVING last_logged IS NULL OR date(last_logged) < date('now', '-3 days')
  `).all(userId);

  // 找最弱维度
  const stats = { health: user.stat_health, finance: user.stat_finance, learning: user.stat_learning, career: user.stat_career, social: user.stat_social, mental: user.stat_mental, habits: user.stat_habits, creativity: user.stat_creativity };
  const weakestDim = Object.entries(stats).sort((a, b) => a[1] - b[1])[0];

  const advices = [];
  const actions = [];

  // 1. 连续打卡警告
  if (user.consecutive_sign_days > 0 && user.consecutive_sign_days % 7 === 0) {
    advices.push(`🔥 连续打卡${user.consecutive_sign_days}天！太厉害了！保持这个势头~`);
  }

  // 2. 今日打卡太少
  if (todayCheckins.c === 0) {
    advices.push(`今天还没打卡呢~ 从「${dimensionNames[weakestDim[0]]}」开始吧！（当前${weakestDim[1]}分）`);
    actions.push({ type: 'checkin', dimension: weakestDim[0], label: `去${dimensionNames[weakestDim[0]]}打卡` });
  }

  // 3. 积压任务提醒
  if (incompleteTasks.c > 3) {
    advices.push(`⚠️ 你有${incompleteTasks.c}个任务还没完成，要不要我帮你重新规划一下？`);
    actions.push({ type: 'view_tasks', label: '查看任务' });
  }

  // 4. 被遗忘的习惯
  if (inactiveHabits.length > 0) {
    const names = inactiveHabits.slice(0, 2).map(h => h.name).join('、');
    advices.push(`${inactiveHabits.length > 2 ? `${inactiveHabits.length}个习惯` : names}最近没坚持了，要不要把难度降低一点？`);
    actions.push({ type: 'view_habits', label: '调整习惯' });
  }

  // 5. 习惯连锁建议
  const chains = detectHabitChains(db, userId);
  if (chains.length > 0) {
    const bestChain = chains.sort((a, b) => b.count - a.count)[0];
    advices.push(`💡 我发现：${bestChain.description}。试试先做前一个，带动后一个！`);
  }

  // 6. 本周总结
  if (weekCheckins.c >= 14) {
    advices.push(`本周表现优秀！共${weekCheckins.c}次打卡，继续保持~ 🎉`);
  } else if (weekCheckins.c < 5) {
    advices.push(`本周打卡偏少（${weekCheckins.c}次），下周定个小目标：每天至少1次~`);
  }

  // 7. 最强习惯鼓励
  if (habits.length > 0 && habits[0].current_streak > 3) {
    advices.push(`🏆「${habits[0].name}」已坚持${habits[0].current_streak}天，你太棒了！`);
  }

  // 8. 升级鼓励
  const nextLevelExp = user.level * 100;
  if (user.exp > nextLevelExp * 0.8) {
    advices.push(`⭐ 还差${nextLevelExp - user.exp}经验值就升级了！今天多完成几个任务吧~`);
  }

  const priority = advices.length >= 3 ? 'high' : advices.length >= 1 ? 'medium' : 'low';

  return {
    advice: advices.join('\n\n'),
    priority,
    actions,
    chains,
    stats: {
      todayCheckins: todayCheckins.c,
      weekCheckins: weekCheckins.c,
      incompleteTasks: incompleteTasks.c,
      weakestDimension: { key: weakestDim[0], name: dimensionNames[weakestDim[0]], value: weakestDim[1] },
      topHabit: habits.length > 0 ? { name: habits[0].name, streak: habits[0].current_streak } : null,
      inactiveHabits: inactiveHabits.length
    }
  };
}

// 智能任务生成 - 基于用户模式自动推荐任务
export function generateSmartTasks(db, userId, count = 3) {
  const tasks = [];
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return tasks;

  // 1. 找最近高频打卡的类别
  const recentCategories = db.prepare(`
    SELECT dimension_id as category, COUNT(*) as cnt 
    FROM check_ins 
    WHERE user_id = ? AND date(checked_at) >= date('now', '-14 days')
    GROUP BY dimension_id 
    ORDER BY cnt DESC 
    LIMIT 3
  `).all(userId);

  // 2. 找最弱维度
  const stats = [
    { key: 'health', val: user.stat_health },
    { key: 'finance', val: user.stat_finance },
    { key: 'learning', val: user.stat_learning },
    { key: 'career', val: user.stat_career },
    { key: 'social', val: user.stat_social },
    { key: 'mental', val: user.stat_mental },
    { key: 'habits', val: user.stat_habits },
    { key: 'creativity', val: user.stat_creativity }
  ].sort((a, b) => a.val - b.val);

  // 3. 找未完成的习惯
  const undoneHabits = db.prepare(`
    SELECT h.name, h.dimension_id 
    FROM habits h 
    WHERE h.user_id = ? AND h.is_active = 1 
    AND (SELECT COUNT(*) FROM habit_logs hl WHERE hl.habit_id = h.id AND date(hl.logged_at) = date('now')) = 0
  `).all(userId);

  // 智能任务模板
  const templates = {
    health: ['快走30分钟', '喝8杯水', '早睡（23点前）', '做10个俯卧撑', '冥想5分钟'],
    finance: ['记账', '查看本周支出', '研究一个理财概念', '设置下月预算', '取消一个不需要的订阅'],
    learning: ['阅读30分钟', '学习一个新单词/概念', '完成在线课程一节课', '写学习笔记', '复习昨天学的内容'],
    career: ['整理待办事项', '完成一个核心任务', '整理工作文件', '回复重要邮件', '学习一个职业技能'],
    social: ['给朋友发消息', '给家人打电话', '参加一个社交活动', '帮助一个人', '分享今天的心情'],
    mental: ['写下3件感恩的事', '正念呼吸5分钟', '记录情绪日记', '听一段放松音乐', '整理房间'],
    habits: ['整理书桌', '早起（7点前）', '睡前不看手机', '写晨间日记', '做一次简短的复盘'],
    creativity: ['画一幅画', '写一段文字', '拍摄一张照片', '学做一道新菜', '尝试一个新想法']
  };

  // 生成高频类别任务（保持习惯）
  for (const cat of recentCategories.slice(0, 1)) {
    const tpls = templates[cat.category] || templates['health'];
    tasks.push({
      title: tpls[Math.floor(Math.random() * tpls.length)],
      dimension: cat.category,
      reason: `基于你的习惯：最近在${dimensionNames[cat.category]}方面很活跃`,
      priority: 'high'
    });
  }

  // 生成弱项提升任务
  for (const dim of stats.slice(0, 2)) {
    if (tasks.find(t => t.dimension === dim.key)) continue;
    const tpls = templates[dim.key] || templates['health'];
    tasks.push({
      title: tpls[Math.floor(Math.random() * tpls.length)],
      dimension: dim.key,
      reason: `当前${dimensionNames[dim.key]}分数较低（${dim.val}分），提升空间大`,
      priority: dim.val < 20 ? 'high' : 'medium'
    });
  }

  // 生成习惯任务
  for (const habit of undoneHabits.slice(0, 1)) {
    if (tasks.find(t => t.title.includes(habit.name))) continue;
    tasks.push({
      title: `完成习惯：${habit.name}`,
      dimension: habit.dimension_id || 'habits',
      reason: `今天的习惯「${habit.name}」还没完成`,
      priority: 'high'
    });
  }

  return tasks.slice(0, count);
}
