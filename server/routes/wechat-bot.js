import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import wechatService from '../services/wechat.js';

const router = Router();

// 微信账号绑定
router.post('/bind', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { wxid } = req.body;
    
    if (!wxid) return res.status(400).json({ error: 'wxid不能为空' });

    // 检查是否已有绑定
    const existing = db.prepare("SELECT * FROM wechat_bindings WHERE wxid = ?").get(wxid);
    if (existing) {
      db.prepare("UPDATE wechat_bindings SET user_id = ?, bind_status = 'active', updated_at = datetime('now') WHERE wxid = ?")
        .run(user.id, wxid);
    } else {
      db.prepare("INSERT INTO wechat_bindings (id, user_id, wxid, bind_status) VALUES (?, ?, ?, 'active')")
        .run(uuid(), user.id, wxid);
    }

    res.json({ success: true, message: '绑定成功' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 解绑
router.post('/unbind', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    db.prepare("UPDATE wechat_bindings SET bind_status = 'inactive' WHERE user_id = ?").run(user.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取绑定状态
router.get('/status', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const binding = db.prepare("SELECT * FROM wechat_bindings WHERE user_id = ? AND bind_status = 'active'").get(user.id);
    res.json({
      bound: !!binding,
      wxid: binding?.wxid || null,
      wechatOnline: false
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 接收微信消息回调（从WeChat-Hook转发来的消息）
router.post('/callback', async (req, res) => {
  const db = req.db;
  try {
    const { wxid, msg, type } = req.body;
    if (!wxid || !msg) return res.status(400).json({ error: '参数错误' });

    // 查找绑定的用户
    const binding = db.prepare("SELECT * FROM wechat_bindings WHERE wxid = ? AND bind_status = 'active'").get(wxid);
    if (!binding) return res.json({ handled: false, reason: 'not_bound' });

    // 异步处理消息（不阻塞响应）
    res.json({ handled: true, processing: true });
    
    wechatService.handleIncomingMessage(db, binding.user_id, wxid, msg).catch(e => {
      console.error('[微信] 消息处理异常:', e.message);
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 手动发送消息
router.post('/send', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { message } = req.body;
    
    const binding = db.prepare("SELECT * FROM wechat_bindings WHERE user_id = ? AND bind_status = 'active'").get(user.id);
    if (!binding) return res.status(400).json({ error: '未绑定微信' });

    const result = await wechatService.sendText(binding.wxid, message);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// WeChat-Hook 状态检查
router.get('/hook-status', async (req, res) => {
  try {
    const status = await wechatService.checkStatus();
    res.json(status);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 消息日志
router.get('/logs', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const logs = db.prepare("SELECT * FROM wechat_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(user.id);
    res.json({ logs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
