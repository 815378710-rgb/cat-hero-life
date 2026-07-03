import { Router } from 'express';
import { startWechat, stopWechat, getWechatStatus, sendToSelf } from '../services/wechat-service.js';

const router = Router();

// 获取微信状态
router.get('/status', (req, res) => {
  res.json(getWechatStatus());
});

// 启动微信
router.post('/start', async (req, res) => {
  try {
    const result = await startWechat();
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 停止微信
router.post('/stop', async (req, res) => {
  try {
    const result = await stopWechat();
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 测试发送
router.post('/test-send', async (req, res) => {
  try {
    const { message } = req.body;
    const result = await sendToSelf(message || '🐱 猫猫侠测试消息！微信通道已连接~');
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
