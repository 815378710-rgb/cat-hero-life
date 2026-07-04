// 猫猫侠 深度游戏化 - 主线剧情、任务链、称号系统、猫猫侠进化
import { v4 as uuid } from 'uuid';

// 初始化主线剧情
export function initStoryArcs(db) {
  const arcs = [
    { id: 'arc_awakening', name: '觉醒', type: 'main', chapter: 1, title: '序章：猫猫侠觉醒', description: '你和猫猫侠的初次相遇', unlock: '{}', sort: 1 },
    { id: 'arc_growth', name: '成长', type: 'main', chapter: 2, title: '成长：一起变强', description: '猫猫侠开始理解人类世界', unlock: '{"level":5}', sort: 2 },
    { id: 'arc_challenge', name: '挑战', type: 'main', chapter: 3, title: '挑战：面对困难', description: '面对更复杂的人生问题', unlock: '{"level":10}', sort: 3 },
    { id: 'arc_awakening2', name: '觉醒II', type: 'main', chapter: 4, title: '觉醒：新的力量', description: '猫猫侠获得预知能力', unlock: '{"level":20}', sort: 4 },
    { id: 'arc_legend', name: '传说', type: 'main', chapter: 5, title: '传说：人生导师', description: '猫猫侠成为真正的人生导师', unlock: '{"level":30}', sort: 5 }
  ];

  for (const arc of arcs) {
    db.prepare('INSERT OR IGNORE INTO story_arcs (id, arc_name, arc_type, chapter, title, description, unlock_condition, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, "locked", ?)')
      .run(arc.id, arc.name, arc.type, arc.chapter, arc.title, arc.description, arc.unlock, arc.sort);
  }
}

// 初始化任务链
export function initQuestChains(db) {
  const chains = [
    {
      id: 'chain_health_awakening', name: '健康觉醒', dimension: 'health', desc: '开启健康生活之旅',
      steps: [
        { num: 1, title: '记录今天的体重', type: 'checkin', target: 1, exp: 10, coin: 5, bonus: '发现体重秤' },
        { num: 2, title: '连续运动3天', type: 'streak', target: 3, exp: 30, coin: 15, bonus: '解锁运动追踪' },
        { num: 3, title: '睡眠达标一周', type: 'streak', target: 7, exp: 50, coin: 25, bonus: '猫猫侠给你讲睡前故事' },
        { num: 4, title: '健康属性达到50', type: 'attribute', target: 50, exp: 100, coin: 50, bonus: '专属健康徽章' }
      ]
    },
    {
      id: 'chain_finance_start', name: '财务自由', dimension: 'finance', desc: '理财第一步',
      steps: [
        { num: 1, title: '记录第一笔支出', type: 'checkin', target: 1, exp: 10, coin: 5, bonus: '获得记账本道具' },
        { num: 2, title: '连续记账7天', type: 'streak', target: 7, exp: 30, coin: 15, bonus: '解锁消费分析' },
        { num: 3, title: '月支出不超预算', type: 'special', target: 1, exp: 50, coin: 25, bonus: '省钱达人称号' },
        { num: 4, title: '财务属性达到50', type: 'attribute', target: 50, exp: 100, coin: 50, bonus: '解锁投资建议' }
      ]
    },
    {
      id: 'chain_social_butterfly', name: '社交蝴蝶', dimension: 'social', desc: '拓展你的社交圈',
      steps: [
        { num: 1, title: '记录一次社交活动', type: 'checkin', target: 1, exp: 10, coin: 5, bonus: '社交入门' },
        { num: 2, title: '连续7天有社交记录', type: 'streak', target: 7, exp: 30, coin: 15, bonus: '人脉扩展' },
        { num: 3, title: '社交属性达到40', type: 'attribute', target: 40, exp: 50, coin: 25, bonus: '社交达人称号' }
      ]
    }
  ];

  for (const chain of chains) {
    db.prepare('INSERT OR IGNORE INTO quest_chains (id, chain_name, dimension_id, description, total_steps, unlock_level) VALUES (?, ?, ?, ?, ?, 1)')
      .run(chain.id, chain.name, chain.dimension, chain.desc, chain.steps.length);
    for (const step of chain.steps) {
      db.prepare('INSERT OR IGNORE INTO quest_steps (id, chain_id, step_number, title, task_type, target_value, exp_reward, coin_reward, bonus_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(uuid(), chain.id, step.num, step.title, step.type, step.target, step.exp, step.coin, step.bonus);
    }
  }
}

// 初始化称号
export function initTitles(db) {
  const titles = [
    { id: 'title_dawn_walker', name: '晨光行者', icon: '🌅', desc: '连续早起7天', condition: 'early_streak_7', rarity: 'rare' },
    { id: 'title_perfect_week', name: '全勤战士', icon: '⚔️', desc: '一周完成所有任务', condition: 'perfect_week', rarity: 'epic' },
    { id: 'title_social_light', name: '人群中的光', icon: '✨', desc: '社交属性最高', condition: 'social_top', rarity: 'rare' },
    { id: 'title_balanced', name: '八面玲珑', icon: '⚖️', desc: '所有属性均衡发展', condition: 'balanced_40', rarity: 'epic' },
    { id: 'title_iron_will', name: '钢铁意志', icon: '🦾', desc: '连续签到30天', condition: 'streak_30', rarity: 'legendary' },
    { id: 'title_cat_whisperer', name: '猫语者', icon: '🐱', desc: '和猫猫侠对话100次', condition: 'chat_100', rarity: 'rare' },
    { id: 'title_night_owl', name: '夜猫子', icon: '🦉', desc: '连续3天凌晨后睡', condition: 'night_3', rarity: 'common' },
    { id: 'title_early_bird', name: '早起鸟', icon: '🐦', desc: '连续7天7点前起床', condition: 'early_7', rarity: 'rare' }
  ];

  for (const t of titles) {
    db.prepare('INSERT OR IGNORE INTO titles (id, name, icon, description, condition_type, condition_value, rarity) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(t.id, t.name, t.icon, t.desc, t.condition, '{}', t.rarity);
  }
}

// 初始化猫猫侠进化形态
export function initCatEvolutions(db) {
  const evolutions = [
    { level: 1, name: '普通小猫', emoji: '🐱', desc: '会说话的基础猫', abilities: '["basic_chat"]' },
    { level: 5, name: '觉醒猫', emoji: '🐱✨', desc: '眼睛发光，能感知情绪', abilities: '["emotion_sense","daily_tasks"]' },
    { level: 10, name: '小狮子', emoji: '🦁', desc: '变大了，更有力量感', abilities: '["data_analysis","random_events"]' },
    { level: 15, name: '猫龙', emoji: '🐉', desc: '有翅膀，能预知', abilities: '["life_planning","insights"]' },
    { level: 20, name: '星辰猫', emoji: '🌟', desc: '全身星光，拥有智慧', abilities: '["emotion_analysis","narrative"]' },
    { level: 30, name: '猫神', emoji: '👑', desc: '最终形态，人生导师', abilities: '["predict","wisdom"]' }
  ];

  for (const e of evolutions) {
    db.prepare('INSERT OR IGNORE INTO cat_evolution (level_required, form_name, form_emoji, description, abilities) VALUES (?, ?, ?, ?, ?)')
      .run(e.level, e.name, e.emoji, e.desc, e.abilities);
  }
}

// 获取当前猫猫侠形态
export function getCurrentCatForm(db, userLevel) {
  const forms = db.prepare('SELECT * FROM cat_evolution WHERE level_required <= ? ORDER BY level_required DESC LIMIT 1').all(userLevel);
  return forms[0] || { form_name: '普通小猫', form_emoji: '🐱', description: '会说话的基础猫' };
}

// 获取下一个进化形态
export function getNextCatForm(db, userLevel) {
  return db.prepare('SELECT * FROM cat_evolution WHERE level_required > ? ORDER BY level_required ASC LIMIT 1').get(userLevel);
}

// 检查称号解锁
export function checkTitleUnlocks(db, userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return [];

  const unlocked = [];

  // 检查各种条件
  const earlyStreak = db.prepare(`SELECT COUNT(*) as c FROM habit_logs hl JOIN habits h ON hl.habit_id = h.id WHERE h.user_id = ? AND h.name LIKE '%早起%' AND hl.logged_at >= datetime('now', '-7 days')`).get(userId);
  if (earlyStreak.c >= 7) unlockTitle(db, userId, 'title_dawn_walker', unlocked);

  if (user.consecutive_sign_days >= 30) unlockTitle(db, userId, 'title_iron_will', unlocked);

  const totalChats = db.prepare('SELECT COUNT(*) as c FROM chat_history WHERE user_id = ? AND role = "user"').get(userId);
  if (totalChats.c >= 100) unlockTitle(db, userId, 'title_cat_whisperer', unlocked);

  const dims = [user.stat_health, user.stat_finance, user.stat_learning, user.stat_career, user.stat_social, user.stat_mental, user.stat_habits, user.stat_creativity];
  if (dims.every(d => d >= 40)) unlockTitle(db, userId, 'title_balanced', unlocked);

  return unlocked;
}

function unlockTitle(db, userId, titleId, unlocked) {
  const existing = db.prepare('SELECT id FROM user_titles WHERE user_id = ? AND title_id = ?').get(userId, titleId);
  if (!existing) {
    db.prepare('INSERT INTO user_titles (id, user_id, title_id) VALUES (?, ?, ?)').run(uuid(), userId, titleId);
    const title = db.prepare('SELECT * FROM titles WHERE id = ?').get(titleId);
    if (title) unlocked.push(title);
  }
}

// 获取用户称号列表
export function getUserTitles(db, userId) {
  return db.prepare('SELECT t.*, ut.unlocked_at, ut.is_active FROM user_titles ut JOIN titles t ON ut.title_id = t.id WHERE ut.user_id = ? ORDER BY ut.unlocked_at DESC').all(userId);
}

// 佩戴称号
export function equipTitle(db, userId, titleId) {
  db.prepare('UPDATE user_titles SET is_active = 0 WHERE user_id = ?').run(userId);
  db.prepare('UPDATE user_titles SET is_active = 1 WHERE user_id = ? AND title_id = ?').run(userId, titleId);
}

// 获取任务链进度
export function getQuestProgress(db, userId) {
  const chains = db.prepare('SELECT * FROM quest_chains ORDER BY sort_order').all();
  return chains.map(chain => {
    const progress = db.prepare('SELECT * FROM user_quest_progress WHERE user_id = ? AND chain_id = ?').get(userId, chain.id);
    const steps = db.prepare('SELECT * FROM quest_steps WHERE chain_id = ? ORDER BY step_number').all(chain.id);
    return { ...chain, progress: progress || { current_step: 1, status: 'locked' }, steps };
  });
}
