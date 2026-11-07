// 人格引擎 - 让猫猫侠从"工具"变成"人"
// 记忆个性化 + 情绪感知 + 主动博弈

const DIM_NAMES = { health:'健康', finance:'财务', learning:'学习', career:'职业', social:'社交', mental:'心理', habits:'习惯', creativity:'创造' };

// 1. 记忆个性化：从聊天中提取用户特质和偏好
export function extractPersonalityTraits(db, userId, message) {
  const traits = [];
  
  // 检测关键话题
  if (/猫|喵|宠物/.test(message)) traits.push({ trait: 'cat_lover', confidence: 0.8, source: 'chat' });
  if (/工作|加班|开会|老板|领导/.test(message)) traits.push({ trait: 'busy_professional', confidence: 0.7, source: 'chat' });
  if (/家人|妈妈|爸爸|父母/.test(message)) traits.push({ trait: 'family_oriented', confidence: 0.9, source: 'chat' });
  if (/运动|跑步|健身|锻炼/.test(message)) traits.push({ trait: 'fitness_interest', confidence: 0.8, source: 'chat' });
  if (/学习了?|看书|课程|技能/.test(message)) traits.push({ trait: 'self_improver', confidence: 0.7, source: 'chat' });
  if (/旅游|旅行|出去/.test(message)) traits.push({ trait: 'traveler', confidence: 0.6, source: 'chat' });
  if (/焦虑|烦躁|累|困|压力/.test(message)) traits.push({ trait: 'stress_prone', confidence: 0.7, source: 'chat' });
  if (/加油|冲|做完了?|完成了?/.test(message)) traits.push({ trait: 'goal_oriented', confidence: 0.8, source: 'chat' });
  
  // 存储到记忆系统
  for (const t of traits) {
    try {
      const existing = db.prepare('SELECT id FROM ai_memory WHERE user_id = ? AND title = ?').get(userId, `人格特质:${t.trait}`);
      if (existing) {
        // ai_memory 表没有 updated_at 列（历史遗留），此前该 UPDATE 一直抛错被吞掉
        db.prepare('UPDATE ai_memory SET importance = MIN(importance + 0.5, 10) WHERE id = ?').run(existing.id);
      } else {
        db.prepare(
          'INSERT INTO ai_memory (id, user_id, memory_layer, memory_type, title, content, summary, importance, tags, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(Date.now().toString(36)+Math.random().toString(36).slice(2,8), userId, 'long_term', 'personality',
          `人格特质:${t.trait}`, `用户展现${t.trait}特质(置信度${t.confidence})`, `${t.trait}`, Math.round(t.confidence * 8), `personality,${t.trait}`, 'personality-engine');
      }
    } catch(e) {}
  }
  
  return traits;
}

// 2. 情绪感知：检测用户当前情绪状态
export function detectEmotion(db, userId, message) {
  const emotions = [];
  
  if (/哈哈|笑死|😂|开心|高兴|爽|nice|棒/.test(message)) emotions.push({ emotion: 'happy', intensity: 7 });
  if (/😢|哭|难过|伤心|难受|心疼/.test(message)) emotions.push({ emotion: 'sad', intensity: 7 });
  if (/气|😡|烦|操|妈的|讨厌/.test(message)) emotions.push({ emotion: 'angry', intensity: 7 });
  if (/怕|紧张|焦虑|担心|怎么办/.test(message)) emotions.push({ emotion: 'anxious', intensity: 6 });
  if (/累|困|乏|疲惫|不想动/.test(message)) emotions.push({ emotion: 'tired', intensity: 6 });
  if (/无聊|没意思|无趣/.test(message)) emotions.push({ emotion: 'bored', intensity: 5 });
  if (/兴奋|激动|期待|迫不及待/.test(message)) emotions.push({ emotion: 'excited', intensity: 8 });
  if (/谢谢|感谢|真好|太好了/.test(message)) emotions.push({ emotion: 'grateful', intensity: 6 });
  
  // 存储情绪日志
  for (const e of emotions) {
    try {
      db.prepare(
        'INSERT INTO emotion_logs (id, user_id, emotion_tag, intensity, content, created_at) VALUES (?, ?, ?, ?, ?, datetime(\"now\"))'
      ).run(Date.now().toString(36)+Math.random().toString(36).slice(2,8), userId, e.emotion, e.intensity, message.slice(0, 200));
    } catch(e) {}
  }
  
  return emotions.length > 0 ? emotions[0] : { emotion: 'neutral', intensity: 5 };
}

// 3. 主动博弈：检查成就/里程碑/连胜，生成主动性提示
export function getActiveNudges(db, userId) {
  const nudges = [];
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return nudges;
  
  // 连胜即将突破
  const streak = user.consecutive_sign_days || 0;
  const milestones = [3, 7, 14, 21, 30, 50, 100];
  const nextMilestone = milestones.find(m => m > streak);
  if (nextMilestone && nextMilestone - streak <= 3) {
    nudges.push({
      type: 'streak', priority: 'high',
      message: `🔥 老大，再坚持${nextMilestone - streak}天就达成${nextMilestone}天连签里程碑了！解锁专属称号！`
    });
  }
  
  // 等级即将提升
  const expToNext = (user.level + 1) * 100;
  const remaining = expToNext - (user.exp || 0);
  if (remaining > 0 && remaining < 50) {
    nudges.push({
      type: 'level_up', priority: 'medium',
      message: `⭐ 差${remaining}EXP就能升到Lv.${user.level + 1}了！完成一两个任务就能升级~`
    });
  }
  
  // 最低维度提醒
  const dims = ['health','finance','learning','career','social','mental','habits','creativity'];
  const scores = dims.map(d => ({ dim: d, score: user['stat_' + d] || 0 }));
  scores.sort((a, b) => a.score - b.score);
  const weakest = scores[0];
  if (weakest.score < 30) {
    nudges.push({
      type: 'weak_dim', priority: 'medium',
      message: `📉 你的「${DIM_NAMES[weakest.dim]}」只有${weakest.score}分，是8个维度里最低的，有空关照一下？`
    });
  }
  
  // 任务即将过期（24小时内未完成的任务）
  const pendingTasks = db.prepare(
    "SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'active' AND scheduled_date <= date('now', '+1 day')"
  ).get(userId);
  if (pendingTasks?.c > 0) {
    nudges.push({
      type: 'task_reminder', priority: 'low',
      message: `📋 有${pendingTasks.c}个任务快过期了，挑一个搞定吧~`
    });
  }
  
  return nudges;
}

// 4. 构建完整人格上下文（注入AI prompt）
export function buildPersonalityContext(db, userId) {
  let ctx = '\n[人格档案]\n';
  
  try {
    // 用户特质
    const traits = db.prepare(
      "SELECT title, importance FROM ai_memory WHERE user_id = ? AND memory_type = 'personality' AND importance >= 5 ORDER BY importance DESC LIMIT 5"
    ).all(userId);
    if (traits.length > 0) {
      ctx += '用户特质: ' + traits.map(t => t.title.replace('人格特质:','')).join(', ') + '\n';
    }
    
    // 最近情绪趋势
    const recentEmotions = db.prepare(
      "SELECT emotion_tag, COUNT(*) as c FROM emotion_logs WHERE user_id = ? AND created_at >= datetime('now','-7 days') GROUP BY emotion_tag ORDER BY c DESC LIMIT 3"
    ).all(userId);
    if (recentEmotions.length > 0) {
      ctx += '最近情绪: ' + recentEmotions.map(e => `${e.emotion}(${e.c}次)`).join(', ') + '\n';
    }
    
    // 主动提示
    const nudges = getActiveNudges(db, userId);
    if (nudges.length > 0) {
      ctx += '可主动提及: ' + nudges.filter(n => n.priority === 'high').map(n => n.message).join(' | ') + '\n';
    }
    
    // 关键记忆（高重要性）
    const keyMemories = db.prepare(
      "SELECT title, content, importance FROM ai_memory WHERE user_id = ? AND importance >= 7 ORDER BY importance DESC LIMIT 3"
    ).all(userId);
    if (keyMemories.length > 0) {
      ctx += '核心记忆: ' + keyMemories.map(m => m.title).join(', ') + '\n';
    }
    
  } catch(e) { ctx += '(人格数据加载中)\n'; }
  
  return ctx;
}

// 5. 每次对话后更新人格数据
export function onChatMessage(db, userId, message, isUser = true) {
  if (!isUser || !message) return;
  
  extractPersonalityTraits(db, userId, message);
  detectEmotion(db, userId, message);
}
