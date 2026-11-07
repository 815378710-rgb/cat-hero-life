import { Router } from 'express';
import { v4 as uuid } from 'uuid';

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
      const streak = user.consecutive_sign_days;
      
      if (streak > 0) {
        return `早安喵~ ☀️ ${name}！新的一天开始了。你已经连续签到${streak}天了，今天继续保持！今天的任务${pendingTasks.c > 0 ? `有${pendingTasks.c}个等着你` : '还没安排呢，要我生成吗'}？加油喵~ 💪`;
      }
      return `早安喵~ ☀️ ${name}！新的一天，新的开始。别忘了签到和完成今天的任务哦~ 我会一直陪着你的！`;
    }
    
    case 'concern': {
      const lastSign = user.last_sign_date;
      if (!lastSign) return `${name}，你还没有签到过呢... 来试试吧，哪怕只是和我打个招呼也好喵~ 🐱`;
      
      const daysDiff = Math.floor((Date.now() - new Date(lastSign)) / 86400000);
      if (daysDiff >= 3) {
        return `喵... ${name}，你已经${daysDiff}天没来了。我知道有时候生活会很累，但我会一直在这里等你。哪怕只是签个到，也是对自己的一个小小承诺。回来吧~ 🥺`;
      }
      if (daysDiff >= 1) {
        return `${name}~ 昨天没见到你呢。今天怎么样？要不要来完成几个任务？我帮你安排了一些轻松的~ 🐱`;
      }
      return null;
    }
    
    case 'milestone': {
      return `🎉 ${name}！恭喜你达到了一个里程碑——${reason}！每一步成长都值得被记住。继续前进，你比你想象的更强大！`;
    }
    
    case 'encouragement': {
      const weakest = ['health','finance','learning','career','social','mental','habits','creativity']
        .map(d => ({ dim: d, val: user[`stat_${d}`] }))
        .sort((a, b) => a.val - b.val)[0];
      
      const dimNames = { health:'健康', finance:'财务', learning:'学习', career:'职业', social:'社交', mental:'心理', habits:'习惯', creativity:'创造' };
      
      return `喵~ ${name}，我观察到你的${dimNames[weakest.dim]}属性最近有点低（${weakest.val}分）。别担心，每个人都有需要提升的地方。要不今天我帮你安排一个${dimNames[weakest.dim]}方面的小任务？一步一步来就好~ ❤️`;
    }
    
    case 'evening': {
      const completed = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(user.id, today);
      const total = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ?").get(user.id, today);
      
      if (completed.c === total.c && total.c > 0) {
        return `晚安喵~ 🌙 ${name}！今天的任务全部完成了，太棒了！好好休息，明天继续加油~ ⭐`;
      }
      if (completed.c > 0) {
        return `晚上好喵~ 🌙 ${name}，今天完成了${completed.c}/${total.c}个任务。还有没完成的，明天再继续吧，不要太累~`;
      }
      return `晚上好喵~ 🌙 ${name}，今天好像没有完成任务呢。没关系，明天是新的一天！好好休息~`;
    }
    
    case 'random': {
      const events = [
        `喵~ ${name}，你知道吗？研究说21天可以养成一个习惯。你现在的连续签到是${user.consecutive_sign_days}天，继续坚持哦！`,
        `${name}，今天过得怎么样？有没有什么开心的事想和我分享？🐱`,
        `嘿${name}~ 有没有觉得最近压力大？试试深呼吸，吸...呼... 感觉好点了吗？🧘`,
        `喵~ ${name}，记得喝水哦！💧 保持身体水分充足是健康的第一步。`,
        `${name}，你有想过一年后的自己会是什么样子吗？和我聊聊你的想法吧~ 💭`,
      ];
      return events[Math.floor(Math.random() * events.length)];
    }
    
    default:
      return `喵~ ${name}，我在呢~ 有什么需要帮忙的吗？`;
  }
}

export default router;
