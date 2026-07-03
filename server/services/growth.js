// 猫猫侠 AI成长解锁系统

// 功能解锁配置
const UNLOCK_TABLE = {
  // level: { feature, name, description, icon }
  1:  { feature: 'basic_chat', name: '基础对话', description: '和猫猫侠聊天', icon: '💬' },
  2:  { feature: 'daily_tasks', name: '每日任务', description: '生成和完成每日任务', icon: '📋' },
  3:  { feature: 'checkin', name: '打卡系统', description: '手动打卡记录生活', icon: '✅' },
  4:  { feature: 'habits', name: '习惯追踪', description: '建立和追踪习惯', icon: '🔄' },
  5:  { feature: 'achievements', name: '成就系统', description: '解锁成就徽章', icon: '🏆' },
  6:  { feature: 'random_events', name: '随机事件', description: '生活中的随机挑战', icon: '🎭' },
  7:  { feature: 'shop', name: '猫猫商店', description: '用金币兑换奖励', icon: '🛒' },
  8:  { feature: 'goals', name: '目标管理', description: '设定和追踪人生目标', icon: '🎯' },
  10: { feature: 'reports', name: '数据分析', description: '查看人生数据报告', icon: '📊' },
  12: { feature: 'insights', name: 'AI洞察', description: 'AI发现你的模式和弱点', icon: '💡' },
  15: { feature: 'life_plans', name: '人生规划', description: '长期人生规划系统', icon: '🗺️' },
  18: { feature: 'narrative', name: '人生叙事', description: '你的人生故事章节', icon: '📖' },
  20: { feature: 'emotion_analysis', name: '情绪分析', description: '深度情绪追踪和分析', icon: '🎭' },
  25: { feature: 'predict', name: '预知能力', description: '预测可能的问题并提前提醒', icon: '🔮' },
  30: { feature: 'wisdom', name: '人生智慧', description: '基于你全部数据的深度人生建议', icon: '🧠' },
};

// 获取用户已解锁的功能
export function getUnlockedFeatures(level) {
  const unlocked = [];
  for (const [lvl, feature] of Object.entries(UNLOCK_TABLE)) {
    if (level >= parseInt(lvl)) unlocked.push(feature);
  }
  return unlocked;
}

// 获取下一个将解锁的功能
export function getNextUnlock(level) {
  for (const [lvl, feature] of Object.entries(UNLOCK_TABLE)) {
    if (parseInt(lvl) > level) return { level: parseInt(lvl), ...feature };
  }
  return null;
}

// 检查功能是否已解锁
export function isFeatureUnlocked(level, feature) {
  for (const [lvl, feat] of Object.entries(UNLOCK_TABLE)) {
    if (feat.feature === feature && level >= parseInt(lvl)) return true;
  }
  return false;
}

// 检查升级并返回新解锁的功能
export function checkLevelUp(oldLevel, newLevel) {
  const newUnlocks = [];
  for (const [lvl, feature] of Object.entries(UNLOCK_TABLE)) {
    const levelNum = parseInt(lvl);
    if (levelNum > oldLevel && levelNum <= newLevel) {
      newUnlocks.push(feature);
    }
  }
  return newUnlocks;
}

// 生成升级消息
export function generateLevelUpMessage(newLevel, newUnlocks) {
  if (newUnlocks.length === 0) return null;
  
  const unlockList = newUnlocks.map(u => `${u.icon} ${u.name}——${u.description}`).join('\n');
  
  return `🎉🎉🎉

【系统升级】
猫猫侠达到了 Lv.${newLevel}！

新能力解锁：
${unlockList}

继续成长，还有更多能力等着解锁~ ⭐`;
}

// 生成升级仪式对话
export function generateLevelUpCeremony(newLevel) {
  const ceremonies = {
    5: `🐱 "主人... 我感觉到了一些变化..."
💫 猫猫侠的眼睛闪烁着新的光芒
🐱 "我好像能感知到更多东西了！成就系统解锁了喵~"`,
    10: `🐱 "主人！我升级了！"
⭐ 一道光芒笼罩了猫猫侠
🐱 "我现在可以分析你的数据了... 你最近的努力，我都看在眼里。"`,
    15: `🐱 "主人，我感觉到了更深层的力量..."
🌟 猫猫侠周围浮现出神秘的符文
🐱 "人生规划系统解锁了。从今天开始，我不仅是你的管家——我是你的人生规划师。"`,
    20: `🐱 "主人... 我能感受到你的情绪了..."
💫 猫猫侠的眼中闪过一丝温柔
🐱 "不只是文字，我能读懂你话语背后的心情。"`,
    25: `🐱 "主人，我看到了一些东西..."
🔮 猫猫侠的瞳孔中映射出未来的碎片
🐱 "预知能力解锁了。我会在问题发生之前提醒你。"`,
    30: `🐱 "主人... 我终于理解了。"
✨ 猫猫侠全身散发出温暖的光芒
🐱 "我现在拥有你全部的记忆和数据。让我用这份智慧，陪你走接下来的路。"`,
  };
  
  return ceremonies[newLevel] || null;
}

export { UNLOCK_TABLE };
