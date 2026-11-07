import { Router } from 'express';
import { setFeishuConfig, getFeishuConfig, sendFeishuMessage, handleFeishuMessage, pushToFeishu } from '../services/feishu-service.js';

const router = Router();

// 获取飞书配置
router.get('/config', (req, res) => {
  res.json({ config: getFeishuConfig() });
});

// 更新飞书配置
router.put('/config', (req, res) => {
  const db = req.db;
  try {
    const { appId, appSecret } = req.body;
    
    // 保存到数据库
    db.prepare("INSERT OR REPLACE INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))").run('feishu_app_id', appId);
    db.prepare("INSERT OR REPLACE INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))").run('feishu_app_secret', appSecret);
    
    setFeishuConfig({ appId, appSecret });
    
    res.json({ success: true, config: getFeishuConfig() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 设置默认聊天ID（用于主动推送）
router.put('/chat-id', (req, res) => {
  const db = req.db;
  try {
    const { chatId } = req.body;
    db.prepare("DELETE FROM system_config WHERE key = 'feishu_chat_id'");
    db.prepare("INSERT INTO system_config (key, value) VALUES ('feishu_chat_id', ?)").run(chatId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 飞书事件回调（Webhook）
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    
    // 飞书URL验证
    if (body.type === 'url_verification') {
      return res.json({ challenge: body.challenge });
    }
    
    // 处理消息事件
    if (body.header?.event_type === 'im.message.receive_v1') {
      await handleFeishuMessage(body.event);
    }
    
    res.json({ code: 0 });
  } catch (e) {
    console.error('飞书webhook处理错误:', e.message);
    res.json({ code: 0 }); // 返回200避免飞书重试
  }
});

// 测试发送消息
router.post('/test-send', async (req, res) => {
  try {
    const { chatId, message } = req.body;
    const result = await sendFeishuMessage(chatId || '', message || '🐱 猫猫侠测试消息！飞书通道已连接~');
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 主动推送
router.post('/push', async (req, res) => {
  try {
    const { message } = req.body;
    const result = await pushToFeishu(message);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
