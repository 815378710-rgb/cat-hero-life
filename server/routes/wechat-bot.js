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

// 接收微信消息 + 同步回复
router.post('/callback', async (req, res) => {
  const db = req.db;
  try {
    const { wxid, msg, sender, content, type: msgType } = req.body;
    const actualWxid = wxid || sender;
    const actualMsg = msg || content;
    
    if (!actualWxid || !actualMsg) {
      return res.json({ handled: false, reply: null, reason: 'no_message' });
    }

    // 查找绑定的用户
    const binding = db.prepare("SELECT * FROM wechat_bindings WHERE user_id = (SELECT id FROM users LIMIT 1) AND bind_status = 'active'").get();
    if (!binding) return res.json({ handled: false, reply: null, reason: 'not_bound' });

    // 记录消息
    try {
      db.prepare("INSERT INTO wechat_logs (user_id, wxid, type, content, status) VALUES (?, ?, 'receive', ?, 'received')")
        .run(binding.user_id, actualWxid, actualMsg.slice(0, 200));
    } catch (e) {}

    // 同步处理并返回回复
    const reply = await processMessageSync(db, binding.user_id, actualWxid, actualMsg);
    res.json({ handled: true, reply: reply });
    
  } catch (e) {
    res.json({ handled: false, reply: null, error: e.message });
  }
});

// 同步消息处理
async function processMessageSync(db, userId, wxid, msg) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const today = new Date().toISOString().split('T')[0];
  const { v4: uid } = await import('uuid');

  // 打卡命令
  const checkinMatch = msg.match(/^(打卡|完成|做了?|跑了?|读了?|学了?|锻炼)\s*(.*)/);
  if (checkinMatch) {
    const detail = checkinMatch[2] || msg;
    
    const dimensionMap = { '运动':'health','跑':'health','锻炼':'health','读书':'learning','学':'learning','工作':'career','社交':'social','冥想':'mental','理财':'finance' };
    let dim = 'habits';
    for (const [k, v] of Object.entries(dimensionMap)) {
      if (detail.includes(k)) { dim = v; break; }
    }
    
    db.prepare("INSERT INTO check_ins (id, user_id, dimension_id, check_type, title, note, checked_at) VALUES (?, ?, ?, 'manual', ?, ?, datetime('now'))")
      .run(uid(), userId, dim, detail, detail);
    
    const exp = 10 + Math.floor(Math.random() * 6);
    const coins = 5 + Math.floor(Math.random() * 4);
    db.prepare(`UPDATE users SET stat_${dim} = MIN(stat_${dim} + 2, 100), exp = exp + ?, coins = coins + ? WHERE id = ?`)
      .run(exp, coins, userId);
    
    if (user.last_sign_date !== today) {
      db.prepare("UPDATE users SET consecutive_sign_days = consecutive_sign_days + 1, last_sign_date = ? WHERE id = ?").run(today, userId);
    }
    
    const streak = user.consecutive_sign_days + 1;
    const streaks = [3, 7, 14, 21, 30, 60, 100];
    let extra = streaks.includes(streak) ? `\n🔥 连续打卡${streak}天！` : '';
    return `✅ 打卡成功！${detail} +${exp}EXP +${coins}金币${extra}`;
  }

  // 状态查询
  if (/^(状态|统计|我的|进度)/.test(msg)) {
    const c = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(userId, today);
    const t = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'completed' AND scheduled_date = ?").get(userId, today);
    return `🐱 ${user.username} 状态\n⭐ Lv.${user.level} | EXP ${user.exp} | 🪙${user.coins}\n🔥 连续${user.consecutive_sign_days}天 | 📝 今日打卡${c.c}次 | ✅ 完成${t.c}个任务`;
  }

  // 帮助
  if (/^(帮助|help|怎么用)/.test(msg)) {
    return '🐱 猫猫侠\n📝 打卡：发「打卡 跑步」\n📊 查看：发「状态」\n💬 聊天：随便说';
  }

  // 默认回复
  const replies = [
    '喵~ 我在呢 🐱',
    '收到！有什么我能帮你的？',
    '在呢在呢~',
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}

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
