import { Router } from 'express';
import { v4 as uuid } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const events = db.prepare(`SELECT se.* FROM story_events se WHERE se.is_active = 1 AND se.id NOT IN (SELECT event_id FROM user_events WHERE user_id = ?) ORDER BY RANDOM() LIMIT 3`).all(user.id);
    res.json({ events });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/resolve', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const { choice_index } = req.body;
    const event = db.prepare('SELECT * FROM story_events WHERE id = ?').get(req.params.id);
    if (!event) return res.status(404).json({ error: '事件不存在' });
    
    const choices = JSON.parse(event.choices || '[]');
    const choice = choices[choice_index] || choices[0];
    
    db.prepare('INSERT INTO user_events (id, user_id, event_id, choice_made) VALUES (?, ?, ?, ?)').run(uuid(), user.id, event.id, choice?.text || 'no choice');
    
    let expGain = (event.exp_reward || 0) + (choice?.exp || 0);
    let coinGain = (event.coin_reward || 0) + (choice?.coins || 0);
    
    const statEffects = JSON.parse(event.stat_effects || '{}');
    if (choice?.stat_change) Object.assign(statEffects, choice.stat_change);
    
    const colMap = { health: 'stat_health', finance: 'stat_finance', learning: 'stat_learning', career: 'stat_career', social: 'stat_social', mental: 'stat_mental', habits: 'stat_habits', creativity: 'stat_creativity' };
    for (const [dim, delta] of Object.entries(statEffects)) {
      const col = colMap[dim];
      if (col) db.prepare(`UPDATE users SET ${col} = MIN(100, MAX(0, ${col} + ?)) WHERE id = ?`).run(delta, user.id);
    }
    
    if (expGain > 0 || coinGain > 0) {
      const getExpForLevel = (l) => Math.floor(100 * Math.pow(1.15, l - 1));
      let newExp = user.exp + expGain, newLevel = user.level;
      while (newExp >= getExpForLevel(newLevel + 1)) { newExp -= getExpForLevel(newLevel + 1); newLevel++; }
      db.prepare('UPDATE users SET level = ?, exp = ?, coins = coins + ?, total_exp = total_exp + ? WHERE id = ?').run(newLevel, newExp, coinGain, expGain, user.id);
    }
    
    res.json({ success: true, choice: choice?.text, rewards: { exp: expGain, coins: coinGain }, effects: statEffects, message: `做出了选择喵！获得 ${expGain}经验 ${coinGain}金币 🎉` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/seed', (req, res) => {
  const db = req.db;
  try {
    const events = [
      { id: uuid(), title: '🐱 流浪猫事件', description: '你在回家路上遇到了一只流浪猫...', event_type: 'random', dimension_id: 'social', choices: JSON.stringify([{ text: '蹲下来摸摸它，买点猫粮', exp: 20, coins: 10, stat_change: { mental: 3, social: 2 } }, { text: '拍照发朋友圈问问谁想养', exp: 15, coins: 5, stat_change: { social: 3 } }, { text: '匆匆路过', exp: 5, coins: 2, stat_change: {} }]), exp_reward: 10, coin_reward: 5, stat_effects: '{}', rarity: 'common' },
      { id: uuid(), title: '📚 旧书店奇遇', description: '你发现了一本绝版好书，只要20块钱...', event_type: 'random', dimension_id: 'learning', choices: JSON.stringify([{ text: '立刻买下来！', exp: 25, coins: -20, stat_change: { learning: 5, creativity: 2 } }, { text: '拍个照记下书名', exp: 15, coins: 0, stat_change: { learning: 2, finance: 1 } }, { text: '算了，家里书还没看完', exp: 5, coins: 0, stat_change: { finance: 1 } }]), exp_reward: 10, coin_reward: 0, stat_effects: '{}', rarity: 'common' },
      { id: uuid(), title: '🌙 深夜灵感', description: '凌晨2点，你突然有一个超棒的创意想法...', event_type: 'random', dimension_id: 'creativity', choices: JSON.stringify([{ text: '爬起来记下来！', exp: 30, coins: 15, stat_change: { creativity: 5, health: -2 } }, { text: '用手机语音备忘录', exp: 20, coins: 10, stat_change: { creativity: 3 } }, { text: '明天再说吧...', exp: 5, coins: 0, stat_change: { health: 1 } }]), exp_reward: 10, coin_reward: 5, stat_effects: '{}', rarity: 'common' },
      { id: uuid(), title: '💼 意外的工作机会', description: '一个前同事联系你，说有个不错的职位...', event_type: 'random', dimension_id: 'career', choices: JSON.stringify([{ text: '认真了解，更新简历', exp: 35, coins: 20, stat_change: { career: 5, finance: 2 } }, { text: '礼貌了解但不急', exp: 20, coins: 10, stat_change: { career: 2, social: 1 } }, { text: '婉拒，现在挺好的', exp: 10, coins: 5, stat_change: { mental: 1 } }]), exp_reward: 15, coin_reward: 10, stat_effects: '{}', rarity: 'rare' },
      { id: uuid(), title: '🏃 晨跑邀请', description: '邻居约你明早6点一起晨跑...', event_type: 'random', dimension_id: 'health', choices: JSON.stringify([{ text: '答应！设好闹钟', exp: 30, coins: 15, stat_change: { health: 5, social: 2 } }, { text: '改成7点，缓冲一下', exp: 20, coins: 10, stat_change: { health: 3 } }, { text: '太早了，下次吧', exp: 5, coins: 0, stat_change: {} }]), exp_reward: 10, coin_reward: 5, stat_effects: '{}', rarity: 'common' },
      { id: uuid(), title: '💰 投资抉择', description: '朋友推荐你买某只股票...', event_type: 'random', dimension_id: 'finance', choices: JSON.stringify([{ text: '研究后小额投资', exp: 25, coins: 10, stat_change: { finance: 4, learning: 2 } }, { text: '先存定期，学习理财', exp: 20, coins: 5, stat_change: { finance: 3, learning: 1 } }, { text: '不碰，放银行最安全', exp: 10, coins: 0, stat_change: { finance: 1, mental: 1 } }]), exp_reward: 15, coin_reward: 5, stat_effects: '{}', rarity: 'rare' },
    ];
    
    const stmt = db.prepare(`INSERT OR IGNORE INTO story_events (id, title, description, event_type, dimension_id, choices, exp_reward, coin_reward, stat_effects, rarity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const e of events) stmt.run(e.id, e.title, e.description, e.event_type, e.dimension_id, e.choices, e.exp_reward, e.coin_reward, e.stat_effects, e.rarity);
    
    res.json({ success: true, count: events.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
