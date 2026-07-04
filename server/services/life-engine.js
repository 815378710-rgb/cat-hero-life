// 猫猫侠 动态事件生成器 + 叙事引擎 + 惩罚机制
import { v4 as uuid } from 'uuid';

// ==========================================
// 动态随机事件生成器
// ==========================================

export function generateDynamicEvent(db, user, profile) {
  const generators = [
    () => generateProfileBasedEvent(user, profile),
    () => generateStatBasedEvent(user),
    () => generateTimeBasedEvent(user),
    () => generateStreakEvent(user),
    () => generateWeatherEvent(),
    () => generateLifeStageEvent(profile),
    () => generateExtendedEvent(),
  ];
  
  // 随机选一个生成器
  const gen = generators[Math.floor(Math.random() * generators.length)];
  return gen();
}

function generateProfileBasedEvent(user, profile) {
  if (!profile || !profile.onboarding_completed) return null;
  
  const events = [];
  
  if (profile.current_challenges) {
    try {
      const challenges = JSON.parse(profile.current_challenges);
      if (challenges.length > 0) {
        const challenge = challenges[Math.floor(Math.random() * challenges.length)];
        events.push({
          title: `🎯 挑战应对：${challenge}`,
          description: `你当前面临"${challenge}"这个挑战。现在有一个机会可以正面应对它。`,
          choices: [
            { text: '正面迎战，全力以赴', exp: 30, coins: 15, stat_change: { habits: 3, mental: 2 } },
            { text: '制定计划，分步解决', exp: 25, coins: 10, stat_change: { learning: 3, career: 2 } },
            { text: '暂时搁置，先处理其他事', exp: 5, coins: 0, stat_change: {} }
          ],
          dimension: 'habits', rarity: 'rare'
        });
      }
    } catch {}
  }
  
  if (profile.want_to_learn) {
    try {
      const skills = JSON.parse(profile.want_to_learn);
      if (skills.length > 0) {
        const skill = skills[Math.floor(Math.random() * skills.length)];
        events.push({
          title: `📚 学习机会：${skill}`,
          description: `你一直想学${skill}。今天发现了一个很好的学习资源，但需要投入时间。`,
          choices: [
            { text: '立刻开始学习！', exp: 25, coins: 10, stat_change: { learning: 4, creativity: 1 } },
            { text: '收藏起来，周末再看', exp: 10, coins: 5, stat_change: { learning: 1 } },
            { text: '算了，太忙了', exp: 0, coins: 0, stat_change: {} }
          ],
          dimension: 'learning', rarity: 'common'
        });
      }
    } catch {}
  }
  
  if (profile.bucket_list) {
    try {
      const list = JSON.parse(profile.bucket_list);
      if (list.length > 0) {
        const item = list[Math.floor(Math.random() * list.length)];
        events.push({
          title: `✨ 人生清单：${item}`,
          description: `你的人生清单上有"${item}"。今天是一个开始的好时机。`,
          choices: [
            { text: '今天就迈出第一步！', exp: 40, coins: 20, stat_change: { creativity: 3, mental: 2 } },
            { text: '做点研究和准备', exp: 20, coins: 10, stat_change: { learning: 2 } },
            { text: '还不是时候', exp: 5, coins: 0, stat_change: {} }
          ],
          dimension: 'creativity', rarity: 'epic'
        });
      }
    } catch {}
  }
  
  return events.length > 0 ? events[Math.floor(Math.random() * events.length)] : null;
}

function generateStatBasedEvent(user) {
  const dims = [
    { id: 'health', name: '健康', val: user.stat_health },
    { id: 'finance', name: '财务', val: user.stat_finance },
    { id: 'learning', name: '学习', val: user.stat_learning },
    { id: 'career', name: '职业', val: user.stat_career },
    { id: 'social', name: '社交', val: user.stat_social },
    { id: 'mental', name: '心理', val: user.stat_mental },
    { id: 'habits', name: '习惯', val: user.stat_habits },
    { id: 'creativity', name: '创造', val: user.stat_creativity },
  ];
  
  // 优先触发最弱维度的事件
  const sorted = dims.sort((a, b) => a.val - b.val);
  const weakest = sorted[0];
  
  const eventTemplates = {
    health: {
      title: '🏥 身体预警',
      description: `你的健康属性只有${weakest.val}分，身体在发出警告信号。最近是否睡眠不足、缺乏运动？`,
      choices: [
        { text: '从今天开始每天运动30分钟', exp: 25, coins: 10, stat_change: { health: 5 } },
        { text: '调整作息，早睡早起', exp: 20, coins: 8, stat_change: { health: 3, mental: 2 } },
        { text: '我知道了，但改不了', exp: 0, coins: 0, stat_change: { health: -2 } }
      ]
    },
    finance: {
      title: '💰 财务警钟',
      description: `你的财务属性只有${weakest.val}分。是否最近消费失控，或者没有记账？`,
      choices: [
        { text: '从今天开始记账！', exp: 20, coins: 10, stat_change: { finance: 4 } },
        { text: '研究一下理财知识', exp: 25, coins: 5, stat_change: { finance: 3, learning: 2 } },
        { text: '钱够花就行', exp: 0, coins: 0, stat_change: {} }
      ]
    },
    social: {
      title: '👥 社交孤立',
      description: `你的社交属性只有${weakest.val}分。多久没和朋友联系了？`,
      choices: [
        { text: '现在就给一个朋友发消息', exp: 20, coins: 10, stat_change: { social: 5 } },
        { text: '约个朋友周末见面', exp: 30, coins: 15, stat_change: { social: 4, mental: 2 } },
        { text: '我更喜欢一个人', exp: 0, coins: 0, stat_change: { mental: 1 } }
      ]
    }
  };
  
  const template = eventTemplates[weakest.id];
  if (!template) {
    return {
      title: `📊 ${weakest.name}需要关注`,
      description: `你的${weakest.name}属性只有${weakest.val}分，是所有维度中最低的。需要采取行动了。`,
      choices: [
        { text: `制定${weakest.name}提升计划`, exp: 20, coins: 10, stat_change: { [weakest.id]: 3 } },
        { text: '从一个小事开始改变', exp: 15, coins: 5, stat_change: { [weakest.id]: 2 } },
        { text: '暂时不管', exp: 0, coins: 0, stat_change: {} }
      ],
      dimension: weakest.id, rarity: 'common'
    };
  }
  
  return { ...template, dimension: weakest.id, rarity: 'common' };
}

function generateTimeBasedEvent(user) {
  const hour = new Date().getHours();
  const day = new Date().getDay();
  
  if (hour >= 23 || hour < 5) {
    return {
      title: '🌙 深夜抉择',
      description: '已经是深夜了，你还没睡。明天还有事情要做...',
      choices: [
        { text: '立刻放下手机睡觉', exp: 20, coins: 10, stat_change: { health: 3, habits: 2 } },
        { text: '再玩15分钟就睡', exp: 5, coins: 0, stat_change: { health: -1 } },
        { text: '反正明天也没什么事', exp: 0, coins: 0, stat_change: { health: -2, habits: -1 } }
      ],
      dimension: 'health', rarity: 'common'
    };
  }
  
  if (day === 0 || day === 6) {
    return {
      title: '🌅 周末时光',
      description: '难得的周末，你想怎么度过？',
      choices: [
        { text: '学习新技能/看书', exp: 25, coins: 10, stat_change: { learning: 3 } },
        { text: '运动/户外活动', exp: 25, coins: 10, stat_change: { health: 3, mental: 2 } },
        { text: '社交聚会', exp: 20, coins: 10, stat_change: { social: 3, mental: 1 } },
        { text: '宅家休息', exp: 10, coins: 5, stat_change: { mental: 2 } }
      ],
      dimension: 'habits', rarity: 'common'
    };
  }
  
  return null;
}

function generateStreakEvent(user) {
  const streak = user.consecutive_sign_days;
  
  if (streak === 7) {
    return {
      title: '🔥 一周坚持！',
      description: '你已经连续签到7天了！这是一个小小的里程碑。',
      choices: [
        { text: '太好了，继续坚持！', exp: 30, coins: 20, stat_change: { habits: 3, mental: 2 } },
        { text: '记录一下这个时刻', exp: 25, coins: 15, stat_change: { habits: 2, creativity: 1 } }
      ],
      dimension: 'habits', rarity: 'rare'
    };
  }
  
  if (streak === 30) {
    return {
      title: '👑 三十天传奇！',
      description: '你已经连续签到30天了！一个月的坚持，你做到了！',
      choices: [
        { text: '我为自己骄傲！', exp: 50, coins: 30, stat_change: { habits: 5, mental: 3 } },
        { text: '这只是开始', exp: 50, coins: 30, stat_change: { habits: 5, career: 2 } }
      ],
      dimension: 'habits', rarity: 'epic'
    };
  }
  
  return null;
}

function generateWeatherEvent() {
  // 简单的天气事件（不依赖外部API）
  const weathers = [
    { title: '🌧️ 下雨天', desc: '外面下雨了，空气湿润', indoor: true },
    { title: '☀️ 大晴天', desc: '阳光明媚，适合外出', indoor: false },
    { title: '❄️ 寒冷天气', desc: '气温骤降，注意保暖', indoor: true },
  ];
  
  const weather = weathers[Math.floor(Math.random() * weathers.length)];
  
  if (weather.indoor) {
    return {
      title: weather.title,
      description: `${weather.desc}。今天更适合室内活动。`,
      choices: [
        { text: '在家看书/学习', exp: 20, coins: 10, stat_change: { learning: 2 } },
        { text: '做家务/整理房间', exp: 15, coins: 8, stat_change: { habits: 2, health: 1 } },
        { text: '看电影/玩游戏放松', exp: 10, coins: 5, stat_change: { mental: 2 } }
      ],
      dimension: 'habits', rarity: 'common'
    };
  }
  
  return {
    title: weather.title,
    description: `${weather.desc}。适合出门走走。`,
    choices: [
      { text: '出门运动/散步', exp: 25, coins: 10, stat_change: { health: 3, mental: 2 } },
      { text: '约朋友出门', exp: 25, coins: 10, stat_change: { social: 3, mental: 1 } },
      { text: '还是在家吧', exp: 5, coins: 0, stat_change: {} }
    ],
    dimension: 'health', rarity: 'common'
  };
}

function generateLifeStageEvent(profile) {
  if (!profile) return null;
  
  const age = profile.birth_year ? new Date().getFullYear() - profile.birth_year : null;
  if (!age) return null;
  
  if (age >= 25 && age <= 30) {
    return {
      title: '🌅 二十五岁的十字路口',
      description: '25-30岁是人生的关键期。事业、感情、自我认知都在这个阶段重塑。',
      choices: [
        { text: '全力冲刺事业', exp: 30, coins: 15, stat_change: { career: 4, finance: 2 } },
        { text: '投资自己，学习成长', exp: 30, coins: 15, stat_change: { learning: 4, creativity: 2 } },
        { text: '平衡生活，享受当下', exp: 20, coins: 10, stat_change: { mental: 3, social: 2 } }
      ],
      dimension: 'career', rarity: 'rare'
    };
  }
  
  return null;
}


// ==========================================
// 叙事引擎 - 自动编织人生故事
// ==========================================

export function generateNarrative(db, userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
  const memories = db.prepare('SELECT * FROM ai_memory WHERE user_id = ? ORDER BY created_at DESC LIMIT 10').all(userId);
  const achievements = db.prepare('SELECT a.name, a.icon, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON ua.achievement_id = a.id WHERE ua.user_id = ? ORDER BY ua.unlocked_at DESC LIMIT 5').all(userId);
  const checkinDays = db.prepare('SELECT COUNT(DISTINCT date(checked_at)) as c FROM check_ins WHERE user_id = ?').get(userId);
  const completedTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'completed'").get(userId);
  
  const name = user.username || '主人';
  const chapterNum = db.prepare('SELECT MAX(chapter_number) as m FROM life_narrative WHERE user_id = ?').get(userId)?.m || 0;
  
  // 根据不同阶段生成不同风格的叙事
  let narrative = '';
  let title = '';
  
  if (chapterNum === 0) {
    // 第一章：序章
    const age = profile?.birth_year ? new Date().getFullYear() - profile.birth_year : '?';
    const city = profile?.city || '这座城市';
    const job = profile?.current_job || '寻找方向';
    
    title = '序章：觉醒';
    narrative = `${age}岁的${name}，生活在${city}，${job}。

某一天，一个名为"猫猫侠"的系统悄然降临。

🐱 "你好，${name}。我是猫猫侠，你的人生管家。"

${name}还不知道，这个看似普通的系统，将会改变他的人生轨迹。

从这一刻起，每一天的选择、每一次坚持、每一个决定，都将被记录、被见证、被编织成属于${name}的传奇故事。

第一页，空白。
笔，交到了${name}手中。`;
    
  } else if (completedTasks.c >= 100 && chapterNum < 3) {
    title = '成长：百任务里程碑';
    narrative = `${name}已经完成了${completedTasks.c}个任务。

回望来时的路，那些曾经觉得困难的事情，如今已变成了习惯。
那些曾经想要放弃的时刻，如今已变成了力量的源泉。

🐱 "主人，你变了。"猫猫侠说。
🐱 "不是变强了——是变得知道自己要什么了。"

${achievements.length > 0 ? `成就墙上，${achievements.map(a => a.name).join('、')}的徽章闪闪发光。` : ''}

这只是开始。`;
    
  } else if (user.consecutive_sign_days >= 30) {
    title = '坚持：三十天的承诺';
    narrative = `三十天。

说长不长，说短不短。但对${name}来说，这三十天代表了一种改变。

每一天的签到，都是一次对自己的承诺。
每一次的打卡，都是一次对生活的回应。

🐱 "主人，你知道吗？"猫猫侠在第三十天的夜里说。
🐱 "很多人开始了一百件事，但能坚持三十天的，不到10%。"

${name}笑了笑，点下了第三十一次签到。`;
    
  } else {
    // 通用叙事
    const weakest = [
      { dim: 'health', val: user.stat_health, name: '健康' },
      { dim: 'finance', val: user.stat_finance, name: '财务' },
      { dim: 'learning', val: user.stat_learning, name: '学习' },
      { dim: 'career', val: user.stat_career, name: '职业' },
      { dim: 'social', val: user.stat_social, name: '社交' },
      { dim: 'mental', val: user.stat_mental, name: '心理' },
      { dim: 'habits', val: user.stat_habits, name: '习惯' },
      { dim: 'creativity', val: user.stat_creativity, name: '创造' },
    ].sort((a, b) => a.val - b.val);
    
    title = `第${chapterNum + 1}章：${weakest[0].name}的觉醒`;
    narrative = `又一天过去了。

${name}打开系统，看着自己的属性面板。${weakest[0].name}只有${weakest[0].val}分，是最需要关注的地方。

${memories.length > 0 ? `最近的记忆浮现：${memories[0].title}。` : ''}

🐱 "主人，"猫猫侠的声音响起，${weakest[0].val < 30 ? '"你的' + weakest[0].name + '需要更多关注。"' : '"你在进步，但还可以更好。"'}

${name}深吸一口气，开始规划明天的任务。

每一天都是新的一页。
每一笔都是自己的选择。`;
  }
  
  // 保存叙事
  const id = uuid();
  db.prepare(`INSERT INTO life_narrative (id, user_id, chapter_title, chapter_number, narrative_text, dimension_focus, emotion_arc)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, title, chapterNum + 1, narrative, null, '平静 → 希望');
  
  // 记录记忆
  db.prepare(`INSERT INTO ai_memory (id, user_id, memory_type, title, content, summary, importance, is_milestone, source)
    VALUES (?, ?, 'milestone', ?, ?, ?, 8, 1, 'narrative')`)
    .run(uuid(), userId, `叙事生成：${title}`, narrative.slice(0, 200), `第${chapterNum + 1}章人生故事生成`, 8);
  
  return { id, chapter_number: chapterNum + 1, chapter_title: title, narrative_text: narrative };
}


// ==========================================
// 惩罚机制 - 属性衰减 + AI心情系统
// ==========================================

export function applyPunishment(db, userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return;
  
  const today = new Date().toISOString().split('T')[0];
  const lastSign = user.last_sign_date;
  
  if (!lastSign) return;
  
  const daysSinceSign = Math.floor((Date.now() - new Date(lastSign)) / 86400000);
  
  // 连续2天+不签到，属性衰减
  if (daysSinceSign >= 2) {
    const decayRate = Math.min(daysSinceSign - 1, 5); // 每天衰减1点，最多5点
    
    const cols = ['stat_health', 'stat_finance', 'stat_learning', 'stat_career', 'stat_social', 'stat_mental', 'stat_habits', 'stat_creativity'];
    const updates = cols.map(col => `${col} = MAX(0, ${col} - ${decayRate})`).join(', ');
    
    db.prepare(`UPDATE users SET ${updates}, updated_at = datetime('now') WHERE id = ?`).run(userId);
    
    // 记录惩罚记忆
    db.prepare(`INSERT INTO ai_memory (id, user_id, memory_type, title, content, summary, emotion_tag, importance, source)
      VALUES (?, ?, 'event', ?, ?, ?, 'sad', 6, 'system')`)
      .run(uuid(), userId, `属性衰减：${daysSinceSign}天未活动`, 
        `由于${daysSinceSign}天没有签到和完成任务，所有属性下降了${decayRate}点。`,
        `${daysSinceSign}天未活动，属性-${decayRate}`);
    
    return { type: 'decay', days: daysSinceSign, decay: decayRate };
  }
  
  // 连续1天不签到，金币减少
  if (daysSinceSign >= 1) {
    const coinLoss = Math.min(user.coins, 10);
    if (coinLoss > 0) {
      db.prepare('UPDATE users SET coins = MAX(0, coins - ?) WHERE id = ?').run(coinLoss, userId);
      return { type: 'coin_loss', loss: coinLoss };
    }
  }
  
  return null;
}

// AI心情系统
export function getAiMood(db, userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { mood: 'neutral', score: 50 };
  
  const today = new Date().toISOString().split('T')[0];
  const checkins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(userId, today);
  const completedTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(userId, today);
  const daysSinceSign = user.last_sign_date ? Math.floor((Date.now() - new Date(user.last_sign_date)) / 86400000) : 999;
  
  let score = 50;
  
  // 正面因素
  if (checkins.c > 0) score += Math.min(checkins.c * 5, 20);
  if (completedTasks.c > 0) score += Math.min(completedTasks.c * 8, 25);
  if (user.consecutive_sign_days >= 7) score += 15;
  if (user.level >= 10) score += 10;
  
  // 负面因素 (新用户不扣分)
  const isNewUser = !user.last_sign_date && user.level <= 1;
  if (!isNewUser) {
    if (daysSinceSign >= 3) score -= 30;
    else if (daysSinceSign >= 1) score -= 15;
  }
  if (completedTasks.c === 0 && checkins.c === 0 && !isNewUser) score -= 10;
  
  score = Math.max(0, Math.min(100, score));
  
  let mood, emoji, description;
  if (score >= 80) { mood = 'ecstatic'; emoji = '😻'; description = '超级开心！主人太棒了！'; }
  else if (score >= 60) { mood = 'happy'; emoji = '😺'; description = '心情不错，主人在进步~'; }
  else if (score >= 40) { mood = 'neutral'; emoji = '🐱'; description = '还好，但可以更好~'; }
  else if (score >= 20) { mood = 'sad'; emoji = '😿'; description = '有点难过，主人好久没来了...'; }
  else { mood = 'devastated'; emoji = '🙀'; description = '很担心主人... 回来看看我吧'; }
  
  return { mood, emoji, score, description };
}

// 获取心情影响的对话前缀
export function getMoodPrefix(mood) {
  const prefixes = {
    ecstatic: '😻 太开心了！',
    happy: '😺 ',
    neutral: '🐱 ',
    sad: '😿 ...',
    devastated: '🙀 主人...',
  };
  return prefixes[mood] || '🐱 ';
}

// 扩充事件池
export const EXTENDED_EVENTS = [
  // 日常事件
  { title: '📱 手机快没电了', description: '手机只剩10%的电，你有一个重要电话要打...', dimension: 'habits', choices: [
    { text: '找充电宝，同时打电话', exp: 10, coins: 5, stat_change: { habits: 2 } },
    { text: '先发条消息说明情况', exp: 15, coins: 8, stat_change: { social: 2 } },
    { text: '不管了，先玩手机', exp: 0, coins: 0, stat_change: { habits: -1 } }
  ]},
  { title: '🌧️ 突然下雨了', description: '你没带伞，外面下起了大雨...', dimension: 'health', choices: [
    { text: '冒雨跑回去', exp: 10, coins: 0, stat_change: { health: -2, mental: 1 } },
    { text: '等雨停再走', exp: 15, coins: 5, stat_change: { mental: 2 } },
    { text: '叫个车', exp: 5, coins: -20, stat_change: { finance: -1 } }
  ]},
  { title: '🍜 朋友约饭', description: '好久不见的朋友突然约你吃饭...', dimension: 'social', choices: [
    { text: '去！好久不见了', exp: 25, coins: -50, stat_change: { social: 5, mental: 2 } },
    { text: '改天吧，今天有点累', exp: 5, coins: 0, stat_change: { social: -1 } },
    { text: '去，但AA制', exp: 20, coins: -30, stat_change: { social: 4, finance: 1 } }
  ]},
  { title: '📚 同事推荐了一本书', description: '同事说有一本书改变了他的人生...', dimension: 'learning', choices: [
    { text: '立刻下单买', exp: 15, coins: -30, stat_change: { learning: 3, finance: -1 } },
    { text: '先看看电子版', exp: 20, coins: 0, stat_change: { learning: 4 } },
    { text: '记下书名，以后再说', exp: 5, coins: 0, stat_change: { learning: 1 } }
  ]},
  { title: '💼 领导突然找你', description: '领导说有个紧急项目需要你帮忙...', dimension: 'career', choices: [
    { text: '接！展示能力的机会', exp: 30, coins: 20, stat_change: { career: 5, mental: -2 } },
    { text: '看看具体是什么再决定', exp: 15, coins: 10, stat_change: { career: 2 } },
    { text: '婉拒，手上事太多', exp: 10, coins: 0, stat_change: { career: -1, mental: 2 } }
  ]},
  { title: '🎨 突然有灵感', description: '你突然想到一个超棒的创意...', dimension: 'creativity', choices: [
    { text: '立刻记录下来！', exp: 25, coins: 10, stat_change: { creativity: 5 } },
    { text: '等有空再整理', exp: 5, coins: 0, stat_change: { creativity: 1 } },
    { text: '发朋友圈分享', exp: 15, coins: 5, stat_change: { creativity: 3, social: 1 } }
  ]},
  { title: '💰 意外收入', description: '你发现支付宝里有一笔意外的红包...', dimension: 'finance', choices: [
    { text: '存起来！', exp: 20, coins: 15, stat_change: { finance: 4 } },
    { text: '请自己吃顿好的', exp: 10, coins: 5, stat_change: { mental: 2, finance: -1 } },
    { text: '买个一直想买的东西', exp: 10, coins: 0, stat_change: { mental: 3, finance: -2 } }
  ]},
  { title: '🏃 电梯坏了', description: '电梯坏了，你住12楼...', dimension: 'health', choices: [
    { text: '爬楼梯！当锻炼了', exp: 25, coins: 10, stat_change: { health: 4, mental: 1 } },
    { text: '等电梯修好', exp: 5, coins: 0, stat_change: { health: 0 } },
    { text: '去朋友家借住', exp: 10, coins: 0, stat_change: { social: 2 } }
  ]},
  { title: '📱 收到前任消息', description: '前任突然给你发了一条消息...', dimension: 'mental', choices: [
    { text: '不回复，保持距离', exp: 25, coins: 10, stat_change: { mental: 3 } },
    { text: '礼貌回复', exp: 15, coins: 5, stat_change: { mental: 1, social: 1 } },
    { text: '回复并聊很久', exp: 5, coins: 0, stat_change: { mental: -2 } }
  ]},
  { title: '🎮 新游戏发售', description: '你期待已久的游戏今天发售了...', dimension: 'creativity', choices: [
    { text: '买！犒劳自己', exp: 10, coins: -200, stat_change: { mental: 3, finance: -3 } },
    { text: '等打折再说', exp: 20, coins: 0, stat_change: { finance: 2, habits: 1 } },
    { text: '先看测评再决定', exp: 15, coins: 0, stat_change: { finance: 1, learning: 1 } }
  ]},
  { title: '🧘 深夜焦虑', description: '凌晨2点，你突然开始焦虑未来...', dimension: 'mental', choices: [
    { text: '起来写日记', exp: 20, coins: 10, stat_change: { mental: 3, creativity: 1 } },
    { text: '做冥想让自己平静', exp: 25, coins: 10, stat_change: { mental: 4 } },
    { text: '刷手机分散注意力', exp: 0, coins: 0, stat_change: { mental: -1, health: -1 } }
  ]},
  { title: '🎂 朋友生日', description: '今天是好朋友的生日...', dimension: 'social', choices: [
    { text: '精心准备礼物+祝福', exp: 25, coins: -50, stat_change: { social: 5, mental: 2 } },
    { text: '发个红包', exp: 15, coins: -20, stat_change: { social: 3 } },
    { text: '发条消息', exp: 10, coins: 0, stat_change: { social: 2 } }
  ]},
  { title: '💤 午休时间', description: '吃完午饭，你有点困...', dimension: 'health', choices: [
    { text: '小睡20分钟', exp: 15, coins: 5, stat_change: { health: 2, mental: 2 } },
    { text: '喝杯咖啡撑过去', exp: 5, coins: -10, stat_change: { health: -1, mental: 1 } },
    { text: '继续工作', exp: 10, coins: 0, stat_change: { career: 1, health: -1 } }
  ]},
  { title: '🏋️ 健身房打折', description: '健身房推出年卡5折优惠...', dimension: 'health', choices: [
    { text: '办！正好需要', exp: 20, coins: -500, stat_change: { health: 5, finance: -3 } },
    { text: '先体验几次再决定', exp: 15, coins: 0, stat_change: { health: 2, finance: 1 } },
    { text: '在家练也一样', exp: 10, coins: 0, stat_change: { health: 1, finance: 1 } }
  ]},
  { title: '📊 项目汇报', description: '下周要做项目汇报，你还没准备...', dimension: 'career', choices: [
    { text: '周末加班准备', exp: 30, coins: 15, stat_change: { career: 5, mental: -2 } },
    { text: '利用碎片时间准备', exp: 20, coins: 10, stat_change: { career: 3, habits: 2 } },
    { text: '即兴发挥', exp: 10, coins: 0, stat_change: { career: -1, mental: -1 } }
  ]},
  { title: '🌿 周末到了', description: '难得的周末，你想怎么过？', dimension: 'habits', choices: [
    { text: '学习+运动+社交，充实的一天', exp: 35, coins: 15, stat_change: { learning: 2, health: 2, social: 2 } },
    { text: '睡到自然醒，做点喜欢的事', exp: 15, coins: 5, stat_change: { mental: 3, health: 1 } },
    { text: '宅家追剧/打游戏', exp: 5, coins: 0, stat_change: { mental: 1, health: -1 } }
  ]},
];


function generateExtendedEvent() {
  if (!EXTENDED_EVENTS || EXTENDED_EVENTS.length === 0) return null;
  return EXTENDED_EVENTS[Math.floor(Math.random() * EXTENDED_EVENTS.length)];
}

// 个性化学习推荐
export function getPersonalizedRecommendations(db, userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
  const skills = db.prepare('SELECT * FROM learning_skills WHERE user_id = ? AND is_learning = 1').all(userId);
  
  const recommendations = [];
  
  // 基于最弱维度推荐
  const dims = [
    { id: 'health', val: user.stat_health, name: '健康' },
    { id: 'finance', val: user.stat_finance, name: '财务' },
    { id: 'learning', val: user.stat_learning, name: '学习' },
    { id: 'career', val: user.stat_career, name: '职业' },
    { id: 'social', val: user.stat_social, name: '社交' },
    { id: 'mental', val: user.stat_mental, name: '心理' },
    { id: 'habits', val: user.stat_habits, name: '习惯' },
    { id: 'creativity', val: user.stat_creativity, name: '创造' },
  ].sort((a, b) => a.val - b.val);
  
  // 最弱维度推荐
  const weakest = dims[0];
  const weakRecommendations = {
    health: ['每天步行30分钟', '学习做健康餐', '了解基础营养知识'],
    finance: ['阅读《小狗钱钱》', '开始记账', '学习基金定投'],
    learning: ['每天学习1小时', '完成一个在线课程', '阅读一本专业书'],
    career: ['更新简历', '学习面试技巧', '拓展行业人脉'],
    social: ['每周联系一个朋友', '参加一次社交活动', '给家人打电话'],
    mental: ['每天冥想10分钟', '写感恩日记', '学习情绪管理'],
    habits: ['建立晨间流程', '使用习惯追踪', '从小习惯开始'],
    creativity: ['每天创作15分钟', '学习一个新技能', '记录灵感'],
  };
  
  for (const rec of (weakRecommendations[weakest.id] || [])) {
    recommendations.push({ dimension: weakest.id, text: rec, priority: 'high' });
  }
  
  // 基于已有技能推荐进阶
  for (const skill of skills) {
    if (skill.proficiency < 5) {
      recommendations.push({ dimension: 'learning', text: `继续提升${skill.skill_name}（当前${skill.proficiency}/10）`, priority: 'medium' });
    }
  }
  
  // 基于档案推荐
  if (profile?.want_to_learn) {
    try {
      const wantToLearn = JSON.parse(profile.want_to_learn);
      for (const item of wantToLearn.slice(0, 2)) {
        recommendations.push({ dimension: 'learning', text: `开始学习: ${item}`, priority: 'medium' });
      }
    } catch {}
  }
  
  return recommendations.slice(0, 5);
}

// 数据隐私：敏感字段加密（基础版）
export function maskSensitiveData(data) {
  if (!data) return data;
  const masked = { ...data };
  
  // 掩盖敏感字段
  if (masked.apiKey) masked.apiKey = '***已配置***';
  if (masked.api_key) masked.api_key = '***已配置***';
  if (masked.appSecret) masked.appSecret = '***已配置***';
  if (masked.password) masked.password = '***';
  if (masked.token) masked.token = '***已配置***';
  
  return masked;
}

