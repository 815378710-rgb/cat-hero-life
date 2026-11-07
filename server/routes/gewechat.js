import { Router } from 'express';
import { setGewechatConfig, getGewechatConfig, getLoginQrCode, checkLoginStatus, sendWechatMessage, pushToWechat, startMessagePolling, stopMessagePolling } from '../services/gewechat-service.js';

const router = Router();

// 获取配置
router.get('/config', (req, res) => {
  res.json({ config: getGewechatConfig() });
});

// 更新配置
router.put('/config', (req, res) => {
  const db = req.db;
  try {
    const { baseUrl, token, wxid } = req.body;
    
    db.prepare("INSERT OR REPLACE INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))").run('gewechat_base_url', baseUrl || 'http://localhost:2531');
    if (token) db.prepare("INSERT OR REPLACE INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))").run('gewechat_token', token);
    if (wxid) db.prepare("INSERT OR REPLACE INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))").run('gewechat_wxid', wxid);
    
    setGewechatConfig({ baseUrl, token, wxid });
    
    res.json({ success: true, config: getGewechatConfig() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取登录二维码
router.get('/qrcode', async (req, res) => {
  try {
    const data = await getLoginQrCode();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 检查登录状态
router.get('/login-status', async (req, res) => {
  try {
    const data = await checkLoginStatus();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 测试发送
router.post('/test-send', async (req, res) => {
  try {
    const { message } = req.body;
    const config = getGewechatConfig();
    if (!config.wxid) return res.json({ success: false, message: '未登录，请先扫码登录' });
    
    const result = await sendWechatMessage(config.wxid, message || '🐱 猫猫侠测试消息！微信通道已连接~');
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 主动推送
router.post('/push', async (req, res) => {
  try {
    const { message } = req.body;
    const result = await pushToWechat(message);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 启动消息监听
router.post('/start-polling', (req, res) => {
  startMessagePolling();
  res.json({ success: true, message: '消息监听已启动' });
});

// 停止消息监听
router.post('/stop-polling', (req, res) => {
  stopMessagePolling();
  res.json({ success: true, message: '消息监听已停止' });
});

export default router;
