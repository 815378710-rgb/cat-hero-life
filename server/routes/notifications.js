import { Router } from 'express';
import { v4 as uuid } from 'uuid';

const router = Router();

// 存储推送订阅（内存+数据库持久化）
let subscriptions = [];

// 初始化：从数据库加载订阅
function loadSubscriptions(db) {
  try {
    const rows = db.prepare("SELECT * FROM push_subscriptions").all();
    subscriptions = rows.map(r => JSON.parse(r.subscription_json));
  } catch {}
}

// 获取VAPID公钥
router.get('/vapid-key', (req, res) => {
  // 生成一个简单的公钥用于浏览器推送
  const publicKey = 'BEl62iUYgUivxIkv69yViE8lRKzP1jby4M2PjTQ6jJlFMiR_S1gQPpKqfLyNB1F8Jf-QPPFCGXQ8P6M2VQfVmHw';
  res.json({ publicKey });
});

// 订阅推送
router.post('/subscribe', (req, res) => {
  const db = req.db;
  try {
    const subscription = req.body;
    const id = uuid();
    
    // 保存到数据库
    try {
      db.prepare('INSERT INTO push_subscriptions (id, subscription_json) VALUES (?, ?)').run(id, JSON.stringify(subscription));
    } catch {
      // 表可能不存在，创建它
      db.exec('CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, subscription_json TEXT, created_at TEXT DEFAULT (datetime(\'now\')))');
      db.prepare('INSERT INTO push_subscriptions (id, subscription_json) VALUES (?, ?)').run(id, JSON.stringify(subscription));
    }
    
    // 保存到内存
    subscriptions.push(subscription);
    
    res.json({ success: true, message: '推送已开启~ 🔔' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 发送本地通知（不依赖VAPID，直接返回通知数据给前端）
router.post('/trigger', (req, res) => {
  const { title, body, tag } = req.body;
  res.json({ 
    success: true, 
    notification: { 
      title: title || '🐱 猫猫侠', 
      body: body || '有新消息~', 
      tag: tag || 'cat-hero' 
    } 
  });
});

// 获取待显示的通知
router.get('/pending', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    // 获取未读的系统对话
    const pending = db.prepare("SELECT * FROM system_dialogues WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 3").all(user.id);
    res.json({ notifications: pending });
  } catch (e) { res.json({ notifications: [] }); }
});

// 标记通知已读
router.post('/read/:id', (req, res) => {
  const db = req.db;
  try {
    db.prepare("UPDATE system_dialogues SET status = 'responded' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
