import { Router } from 'express';
import { v4 as uuid } from 'uuid';

const router = Router();

router.get('/items', (req, res) => {
  const db = req.db;
  try {
    const { category } = req.query;
    let sql = 'SELECT * FROM shop_items WHERE stock != 0';
    const params = [];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY price ASC';
    res.json({ items: db.prepare(sql).all(...params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/purchase/:itemId', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const item = db.prepare('SELECT * FROM shop_items WHERE id = ?').get(req.params.itemId);
    if (!item) return res.status(404).json({ error: '商品不存在' });
    if (user.coins < item.price) return res.json({ success: false, message: `金币不足喵！需要${item.price}，你有${user.coins} 💰` });
    if (item.stock === 0) return res.json({ success: false, message: '已售罄喵~' });
    
    db.prepare('UPDATE users SET coins = coins - ? WHERE id = ?').run(item.price, user.id);
    db.prepare('INSERT INTO user_purchases (id, user_id, item_id, price_paid) VALUES (?, ?, ?, ?)').run(uuid(), user.id, item.id, item.price);
    if (item.stock > 0) db.prepare('UPDATE shop_items SET stock = stock - 1 WHERE id = ?').run(item.id);
    
    res.json({ success: true, message: item.item_type === 'real_reward' ? `购买成功喵！🎁 ${item.real_reward_desc}` : `购买成功喵！已解锁 ${item.name} ✨`, remaining_coins: user.coins - item.price });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/purchases', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const purchases = db.prepare(`SELECT up.*, si.name, si.icon, si.category, si.item_type, si.real_reward_desc FROM user_purchases up JOIN shop_items si ON up.item_id = si.id WHERE up.user_id = ? ORDER BY up.purchased_at DESC`).all(user.id);
    res.json({ purchases });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/purchases/:id/use', (req, res) => {
  const db = req.db;
  try { db.prepare("UPDATE user_purchases SET status = 'used', used_at = datetime('now') WHERE id = ?").run(req.params.id); res.json({ success: true, message: '享受你的奖励吧喵~ 🎉' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
