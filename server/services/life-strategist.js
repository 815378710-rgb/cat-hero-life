// 人生策略引擎 - 因果分析 + 成功建模 + 策略生成
// 让猫猫侠从"管家"升级为"教练"

const DIM_NAMES = { health:'健康', finance:'财务', learning:'学习', career:'职业', social:'社交', mental:'心理', habits:'习惯', creativity:'创造' };
const ALL_DIMS = Object.keys(DIM_NAMES);

// ===== 1. 因果分析 =====
// 分析"做了X → Y维度提升"的因果关系
export function causalAnalysis(db, userId) {
  const findings = [];
  
  // 获取最近30天的打卡+维度历史
  const checkins = db.prepare(`
    SELECT date(ci.checked_at) as day, ci.dimension_id as dim, ci.title
    FROM check_ins ci 
    WHERE ci.user_id = ? AND ci.checked_at >= datetime('now','-30 days')
    ORDER BY ci.checked_at
  `).all(userId);

  const dimensionHistory = db.prepare(`
    SELECT user_id, dimension, score, recorded_at 
    FROM dimension_history 
    WHERE user_id = ? AND recorded_at >= datetime('now','-30 days')
    ORDER BY recorded_at
  `).all(userId);

  if (checkins.length < 5 || dimensionHistory.length < 3) {
    return { findings: [], summary: '数据不足，再使用几天后激活因果分析' };
  }

  // 按天分组：某天做了什么，维度分数有何变化
  const dailyActivity = {};
  for (const c of checkins) {
    if (!dailyActivity[c.day]) dailyActivity[c.day] = new Set();
    dailyActivity[c.day].add(c.dim);
  }

  // 分析"做了健康 → 之后N天其他维度变化"
  const dimImpact = {};
  for (const dim of ALL_DIMS) {
    dimImpact[dim] = { boosted: {}, total_checks: 0 };
  }

  for (const [day, dims] of Object.entries(dailyActivity)) {
    for (const d of dims) {
      dimImpact[d].total_checks++;
    }
  }

  // 如果运动维度有天被激活，检查接下来几天其他维度是否也在增长
  if (dimImpact['health'].total_checks >= 3 && dimensionHistory.length >= 5) {
    const healthDays = Object.keys(dailyActivity).filter(d => dailyActivity[d].has('health')).sort();
    let postHealthScores = {};
    
    for (const hd of healthDays) {
      // 找到运动后3天内的所有维度变化
      const hDate = new Date(hd);
      for (const dh of dimensionHistory) {
        const dhDate = new Date(dh.recorded_at.split(' ')[0]);
        const diffDays = (dhDate - hDate) / 86400000;
        if (diffDays >= 0 && diffDays <= 3 && dh.dimension !== 'health') {
          if (!postHealthScores[dh.dimension]) postHealthScores[dh.dimension] = [];
          postHealthScores[dh.dimension].push(dh.score);
        }
      }
    }

    for (const [dim, scores] of Object.entries(postHealthScores)) {
      if (scores.length >= 3) {
        const avg = scores.reduce((a,b)=>a+b,0)/scores.length;
        const prevAvg = dimensionHistory
          .filter(h => h.dimension === dim && new Date(h.recorded_at) < new Date(healthDays[0]))
          .reduce((a,b)=>a+b.score, 0) / Math.max(1, dimensionHistory.filter(h => h.dimension === dim).length);
        
        const boost = avg - prevAvg;
        if (boost > 3) {
          findings.push({
            type: 'causality', source: '运动', target: DIM_NAMES[dim],
            effect: `运动后3天${DIM_NAMES[dim]}平均提升${boost.toFixed(1)}分`,
            confidence: Math.min(0.9, scores.length / 10),
            icon: '🏃→📈'
          });
        }
      }
    }
  }

  // 分析任务完成对职业维度的推动
  const completedTasks = db.prepare(`
    SELECT date(scheduled_date) as day, COUNT(*) as done 
    FROM tasks WHERE user_id = ? AND status='completed' AND scheduled_date >= date('now','-30 days')
    GROUP BY day ORDER BY day
  `).all(userId);

  if (completedTasks.length >= 5 && dimImpact['career']?.total_checks < 5) {
    findings.push({
      type: 'suggestion', target: '职业',
      effect: `已完成${completedTasks.reduce((a,b)=>a+b.done,0)}个任务但「职业」维度打卡较少——完成任务后顺手打卡效果最好`,
      confidence: 0.7, icon: '📋'
    });
  }

  // 财务健康分析
  const financeStats = db.prepare(`
    SELECT today_expense, month_expense FROM finance_stats 
    WHERE user_id = ? ORDER BY date DESC LIMIT 14
  `).all(userId);

  if (financeStats.length >= 7) {
    const avgWeekly = financeStats.reduce((a,b)=>a+b.today_expense,0) / financeStats.length * 7;
    const mentalScores = dimensionHistory.filter(h => h.dimension === 'mental');
    if (mentalScores.length >= 3) {
      // 简单相关性：花费高vs心理分低
      const highSpendDays = financeStats.filter(f => f.today_expense > 100).length;
      const mentalAvg = mentalScores.reduce((a,b)=>a+b.score,0)/mentalScores.length;
      if (highSpendDays > financeStats.length * 0.3 && mentalAvg < 40) {
        findings.push({
          type: 'risk', target: '心理',
          effect: `高消费天数占比${Math.round(highSpendDays/financeStats.length*100)}%，心理分仅${mentalAvg.toFixed(0)}——控制开支可能改善心态`,
          confidence: 0.75, icon: '⚠️'
        });
      }
    }
  }

  return {
    findings: findings.slice(0, 5),
    summary: findings.length > 0 
      ? `基于${checkins.length}条打卡记录发现${findings.length}条规律`
      : '数据积累中，继续使用系统即可激活因果分析'
  };
}

// ===== 2. 成功模型：目标分数计算 =====
export function buildSuccessModel(db, userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const dims = ALL_DIMS.map(d => ({ dim: d, name: DIM_NAMES[d], score: user[`stat_${d}`] || 0 }));
  dims.sort((a, b) => b.score - a.score);

  // 加权综合分数（核心维度权重更高）
  const coreWeights = { health: 1.5, finance: 1.3, career: 1.3, learning: 1.1, mental: 1.5, social: 0.8, habits: 0.9, creativity: 0.6 };
  let weightedTotal = 0, weightSum = 0;
  for (const d of dims) {
    const w = coreWeights[d.dim] || 1;
    weightedTotal += d.score * w;
    weightSum += w;
  }
  const lifeScore = Math.round(weightedTotal / weightSum);

  // 差距分析
  const gaps = dims.filter(d => d.score < 50).map(d => ({
    ...d, gap: 50 - d.score,
    target_action: getActionForDim(d.dim, d.score)
  }));

  // 优势分析
  const strengths = dims.filter(d => d.score >= 60);

  return {
    life_score: lifeScore,
    level: lifeScore >= 80 ? '卓越' : lifeScore >= 60 ? '稳健' : lifeScore >= 40 ? '发展期' : '重建期',
    strengths: strengths.slice(0, 3),
    gaps: gaps.slice(0, 3),
    dims,
    recommendation: gaps.length > 0
      ? `优先提升「${gaps[0].name}」(${gaps[0].score}分)，预计可带动整体提升${Math.round(gaps[0].gap * 0.15)}分`
      : '所有维度均衡发展，继续保持！'
  };
}

function getActionForDim(dim, score) {
  const actions = {
    health: '每天走8000步或运动30分钟',
    finance: '记录每一笔支出，坚持7天',
    learning: '每天学习30分钟并打卡',
    career: '每天完成至少1个工作任务',
    social: '主动联系1个朋友',
    mental: '每天花5分钟写日记或冥想',
    habits: '选1个简单习惯开始追踪',
    creativity: '每周花1小时做创造性活动'
  };
  return actions[dim] || '每天打卡1次';
}

// ===== 3. 策略生成：每日行动推荐 =====
export function generateDailyStrategy(db, userId) {
  const model = buildSuccessModel(db, userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const today = new Date();

  // 根据时间推荐最优动作
  const hour = today.getHours();
  const timeSlots = [];

  if (hour < 9) {
    timeSlots.push({ time: '8:00-9:00', action: '运动/散步', dim: 'health', reason: '早起运动能激活全天精力' });
    timeSlots.push({ time: '9:00-11:00', action: '最难的1个任务', dim: 'career', reason: '上午是认知效率最高的时候' });
  } else if (hour < 14) {
    timeSlots.push({ time: '现在-14:00', action: '处理2个任务', dim: 'career', reason: '趁能量还在，搞定最难的事' });
    timeSlots.push({ time: '14:00-15:00', action: '午休/散步', dim: 'health', reason: '下午倦怠期适合低强度活动' });
  } else {
    timeSlots.push({ time: '现在-18:00', action: '学习或社交', dim: 'learning', reason: '下午适合输入型活动' });
    timeSlots.push({ time: '19:00-21:00', action: '放松/家庭时间', dim: 'social', reason: '晚间适合关系维护' });
  }

  // 基于最弱维度的紧急任务
  const urgentAction = model.gaps[0];
  const priorityActions = model.gaps.map(g => ({
    dim: g.name, score: g.score, action: g.target_action, urgency: g.gap > 30 ? '高' : '中'
  }));

  // 生成"最佳一天"模板
  const bestDay = [
    { time: '7:30', activity: '起床 + 健康打卡', dim: 'health' },
    { time: '8:00', activity: model.gaps[0]?.target_action || '运动30分钟', dim: model.gaps[0]?.dim || 'health' },
    { time: '9:00', activity: '处理1个重要任务', dim: 'career' },
    { time: '10:30', activity: '学习25分钟（番茄钟）', dim: 'learning' },
    { time: '12:00', activity: '午餐 + 社交/联系朋友', dim: 'social' },
    { time: '14:00', activity: '处理1个中等任务', dim: 'career' },
    { time: '16:00', activity: '创造性时间（写/画/想）', dim: 'creativity' },
    { time: '18:00', activity: '运动或散步', dim: 'health' },
    { time: '20:00', activity: '记账5分钟 + 复盘', dim: 'finance' },
    { time: '22:00', activity: '写日记/冥想5分钟', dim: 'mental' },
    { time: '23:00', activity: '检查明日任务 + 睡觉', dim: 'habits' },
  ];

  return {
    life_score: model.life_score,
    level: model.level,
    today_time_slots: timeSlots,
    weakest_areas: priorityActions.slice(0, 2),
    best_day_template: bestDay,
    progress_tips: [
      model.life_score < 40 ? '现在是重建期，每天完成1个小目标就是胜利' :
      model.life_score < 60 ? '发展期关键是建立习惯——质量>数量' :
      model.life_score < 80 ? '稳健期可以增加挑战，试试新领域' : '卓越期保持节奏，同时帮助他人成长'
    ]
  };
}

// ===== 4. 为AI上下文构建策略摘要 =====
export function buildStrategyContext(db, userId) {
  try {
    const causal = causalAnalysis(db, userId);
    const strategy = generateDailyStrategy(db, userId);

    let ctx = `\n[策略引擎 · 人生分数:${strategy.life_score} · ${strategy.level}]\n`;

    if (causal.findings.length > 0) {
      ctx += '因果发现: ' + causal.findings.map(f => f.effect).join(' | ') + '\n';
    }

    ctx += '今日最优: ' + strategy.today_time_slots.map(s => `${s.time}=${s.action}`).join(', ') + '\n';
    ctx += '薄弱点: ' + strategy.weakest_areas.map(w => `${w.dim}(${w.score}分)`).join(', ') + '\n';
    ctx += '行动建议: ' + strategy.progress_tips[0] + '\n';

    return ctx;
  } catch (e) {
    return '';
  }
}
