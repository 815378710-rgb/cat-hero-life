import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { personaTpl } from '../services/persona.js';

const router = Router();

// 获取待处理的系统对话
router.get('/pending', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const dialogues = db.prepare(`SELECT * FROM system_dialogues 
      WHERE user_id = ? AND status = 'pending' 
      ORDER BY created_at DESC LIMIT 5`).all(user.id);
    res.json({ dialogues });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 回复系统对话
router.post('/:id/respond', (req, res) => {
  const db = req.db;
  try {
    const { response } = req.body;
    db.prepare("UPDATE system_dialogues SET status = 'responded', user_response = ?, responded_at = datetime('now') WHERE id = ?")
      .run(response, req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// AI主动发起对话
router.post('/initiate', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    const { dialogue_type, trigger_reason } = req.body;
    
    const message = generateProactiveMessage(db, user, profile, dialogue_type, trigger_reason);
    
    const id = uuid();
    db.prepare(`INSERT INTO system_dialogues (id, user_id, dialogue_type, trigger_reason, ai_message, status)
      VALUES (?, ?, ?, ?, ?, 'pending')`).run(id, user.id, dialogue_type, trigger_reason, message);
    
    // 同时存入聊天记录
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'assistant', ?)").run(user.id, message);
    
    res.json({ success: true, id, message });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function generateProactiveMessage(db, user, profile, type, reason) {
  const name = user.username || '主人';
  const today = new Date().toISOString().split('T')[0];
  const hour = new Date().getHours();
  
  switch (type) {
    case 'morning': {
      const pendingTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'pending'").get(user.id, today);
      const streak = user.consecutive_sign_days || 0;
      const streakLine = streak > 0 ? `连签${streak}天了，` : '';
      const taskLine = `${streakLine}今天${pendingTasks.c > 0 ? `有${pendingTasks.c}个任务等着` : '还没安排任务，要我生成吗'}。`;
      return personaTpl('morning', { name, taskLine });
    }
    
    case 'concern': {
      const lastSign = user.last_sign_date;
      if (!lastSign) return personaTpl('morningNoSign', { name });

      const daysDiff = Math.floor((Date.now() - new Date(lastSign)) / 86400000);
      if (daysDiff >= 3) return `${name}，${daysDiff}天没见你了……回来坐会儿呀。`;
      if (daysDiff >= 1) return `${name}，昨天没见着你。今天怎么样？`;
      return null;
    }
    
    case 'milestone': {
      return `${name}，${reason}。这个记一笔，继续走。`;
    }
    
    case 'encouragement': {
      const weakest = ['health','finance','learning','career','social','mental','habits','creativity']
        .map(d => ({ dim: d, val: user[`stat_${d}`] }))
        .sort((a, b) => a.val - b.val)[0];

      const dimNames = { health:'健康', finance:'财务', learning:'学习', career:'职业', social:'社交', mental:'心理', habits:'习惯', creativity:'创造' };
      return personaTpl('weakDim', { name, dim: dimNames[weakest.dim] });
    }
    
    case 'evening': {
      const completed = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(user.id, today);
      const total = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ?").get(user.id, today);

      if (completed.c === total.c && total.c > 0) return personaTpl('eveningAllDone', { name });
      if (completed.c > 0) return personaTpl('eveningPartial', { name, completed: completed.c, total: total.c });
      return personaTpl('eveningNone', { name });
    }
    
    case 'random': {
      const events = [
        `${name}，说 21 天能养成一个习惯，你现在连签${user.consecutive_sign_days || 0}天了。`,
        `${name}，今天怎么样？有开心的事说来听听。`,
        `嘿，${name}。最近要是压得慌，先歇一会儿，不急。`,
        `${name}，喝水了没？别光顾着忙。`,
        `${name}，有没有想过一年后的自己什么样？想聊就聊。`,
      ];
      return events[Math.floor(Math.random() * events.length)];
    }

    default:
      return personaTpl('greeting', { name });
  }
}

export default router;
