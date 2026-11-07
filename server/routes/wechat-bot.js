// 微信消息回调 + 消息处理
import { Router } from 'express';
import wechatService from '../services/wechat.js';
import { heartbeat, isDuplicateMessage, getAllStatus, getAlerts, recordMessageProcessed } from '../services/wechat-monitor.js';
import { v4 as uid } from 'uuid';
import { analyzeEmotionDeep } from '../services/emotion-engine.js';
import { safeSlice } from '../services/ai-engine.js';
import { silent } from '../utils/silent.js';

const router = Router();

// 微信绑定状态
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
    const { wxid, msg, sender, content, type: msgType, msg_id } = req.body;
    const actualWxid = wxid || sender;
    const actualMsg = msg || content;

    // 心跳：每次收到回调都算一次心跳
    heartbeat('callback');

    if (!actualWxid || !actualMsg) {
      return res.json({ handled: false, reply: null, reason: 'no_message' });
    }

    // 消息去重
    const msgId = msg_id || `${actualWxid}_${actualMsg.slice(0, 30)}`;
    if (isDuplicateMessage('callback', msgId)) {
      return res.json({ handled: false, reply: null, reason: 'duplicate' });
    }

    const binding = db.prepare("SELECT * FROM wechat_bindings WHERE user_id = (SELECT id FROM users LIMIT 1) AND bind_status = 'active'").get();
    if (!binding) return res.json({ handled: false, reply: null, reason: 'not_bound' });

    try {
      db.prepare("INSERT INTO wechat_logs (user_id, wxid, type, content, status) VALUES (?, ?, 'receive', ?, 'received')")
        .run(binding.user_id, actualWxid, safeSlice(actualMsg, 200));
    } catch (e) {}

    const reply = await processMessageSync(db, binding.user_id, actualWxid, actualMsg);

    // 统计已处理消息
    recordMessageProcessed('callback');

    // 顺便带回待发送消息
    const pendingMsgs = db.prepare(
      "SELECT id, message FROM pending_wechat_msgs WHERE user_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 2"
    ).all(binding.user_id);
    pendingMsgs.forEach(m => db.prepare("UPDATE pending_wechat_msgs SET status='sent' WHERE id=?").run(m.id));

    res.json({
      handled: true,
      reply: reply,
      pending_notifications: pendingMsgs.map(m => m.message)
    });

  } catch (e) {
    res.json({ handled: false, reply: null, error: e.message });
  }
});

// 自动从对话中提取并保存档案信息（export 供测试用）
export function autoSaveProfile(db, userId, history, user) {
  try {
    const allText = history.map(h => h.content || '').join('\n');

    // 检查是否已经有生命档案
    let profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
    const isNew = !profile;

    if (isNew) {
      db.prepare(
        "INSERT INTO life_profile (id, user_id, created_at) VALUES (?, ?, datetime('now'))"
      ).run(uid(), userId);
      profile = { user_id: userId };
    }

    const updates = {};

    // 姓名（life_profile 无 nickname 列，昵称存 users.username）
    const nameMatch = allText.match(/叫[你我]?(.{1,5})|我是(.{1,5})[，。]/);
    if (nameMatch) {
      const nm = (nameMatch[1] || nameMatch[2] || '').replace(/主人|老大|老板/, '').trim();
      if (nm) {
        try { db.prepare('UPDATE users SET username = ? WHERE id = ?').run(nm, userId); }
        catch (e) { silent('微信/修改用户名', e); }
      }
    }

    // 出生 / 年龄
    if (!profile.birth_year) {
      const birthMatch = allText.match(/(\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
      if (birthMatch) {
        const year = 2000 + parseInt(birthMatch[1]);
        if (year >= 1990 && year <= 2020) updates.birth_year = year;
      }
      const ageMatch = allText.match(/(\d{2})\s*岁/);
      if (ageMatch) {
        const age = parseInt(ageMatch[1]);
        if (age >= 15 && age <= 60) {
          updates.birth_year = new Date().getFullYear() - age;
        }
      }
    }

    // 身高体重
    if (!profile.height_cm) {
      const hwMatch = allText.match(/身高\s*(\d{3})|(\d{3}).*?身高/);
      if (hwMatch) updates.height_cm = parseInt(hwMatch[1] || hwMatch[2]);
    }
    if (!profile.weight_kg) {
      const wMatch = allText.match(/体重\s*(\d{2,3})/);
      if (wMatch) updates.weight_kg = parseInt(wMatch[1]);
    }

    // 职业 / 收入
    if (!profile.current_job) {
      const jobMatch = allText.match(/(小红书运营|程序员|产品经理|电商运营|新媒体运营|运营|销售|设计|教师|医生|学生|自由职业)/);
      if (jobMatch) updates.current_job = jobMatch[1];
    }
    if (!profile.annual_income_range) {
      // 只在收入语境窗口内累加所有 k/w 数值，排除「存100w/买38w」等目标与资产干扰
      const incomeContexts = allText.match(/月收入.{0,40}|兼职.{0,40}|代运营.{0,40}|其他业务.{0,40}|工资.{0,40}|收入.{0,40}/g) || [];
      let monthly = 0;
      for (const ctx of incomeContexts) {
        const ms = [...ctx.matchAll(/(\d+\.?\d*)\s*[kKw万]/g)];
        for (const m of ms) {
          monthly += parseFloat(m[1]) * (m[0].includes('万') ? 10000 : 1000);
        }
      }
      if (monthly > 0) updates.annual_income_range = String(Math.round(monthly * 12 / 10000)) + '万';
    }

    // 城市
    if (!profile.city) {
      const cityMatch = allText.match(/在[西济][安南]/);
      if (cityMatch) updates.city = cityMatch[0].replace('在', '');
    }

    // 执行更新
    const fields = Object.keys(updates);
    if (fields.length > 0) {
      const setClause = fields.map(f => `${f} = ?`).join(', ');
      const values = fields.map(f => updates[f]);
      db.prepare(`UPDATE life_profile SET ${setClause} WHERE user_id = ?`).run(...values, userId);
    }

    // 检查是否足够激活（有年龄+职业就认为建档完成，life_profile 无 nickname 列）
    profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
    if (profile && profile.birth_year && profile.current_job && !profile.onboarding_completed) {
      db.prepare('UPDATE life_profile SET onboarding_completed = 1 WHERE user_id = ?').run(userId);
      profile.onboarding_completed = 1;
    }

    // 自动提取长期目标
    autoExtractGoals(db, userId, allText);

    return profile;
  } catch (e) {
    console.error('autoSaveProfile:', e.message);
    return db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId) || null;
  }
}

// 从对话中自动提取长期目标
function autoExtractGoals(db, userId, allText) {
  try {
    const dimMap = {
      'finance': { id: db.prepare("SELECT id FROM life_dimensions WHERE name='财务' LIMIT 1").get()?.id },
      'career':  { id: db.prepare("SELECT id FROM life_dimensions WHERE name='事业' LIMIT 1").get()?.id },
      'learning':{ id: db.prepare("SELECT id FROM life_dimensions WHERE name='学习' LIMIT 1").get()?.id },
      'health':  { id: db.prepare("SELECT id FROM life_dimensions WHERE name='健康' LIMIT 1").get()?.id },
    };

    const goalPatterns = [
      { regex: /(?:存|攒|攒够)(\d+)万/, dim: 'finance', unit: '万元' },
      { regex: /(?:年入|年薪)(\d+)万/, dim: 'finance', unit: '万元/年' },
      { regex: /买(\d+)套房/, dim: 'finance', unit: '套' },
      { regex: /买房/, dim: 'finance', unit: null },
      { regex: /买(\d+)辆车/, dim: 'finance', unit: '辆' },
      { regex: /买车/, dim: 'finance', unit: null },
      { regex: /(?:开|创)(?:公司|代运营公司)/, dim: 'career', unit: null },
      { regex: /(?:减|瘦)(?:到|到?)(\d+)斤/, dim: 'health', unit: '斤' },
      { regex: /(?:体脂|体脂率)(?:到|降到)(\d+)%/, dim: 'health', unit: '%' },
    ];

    for (const p of goalPatterns) {
      const match = allText.match(p.regex);
      if (!match) continue;
      const targetValue = match[1] ? parseFloat(match[1]) : null;

      // 生成标题
      let title = match[0];
      if (p.regex === /买房/) title = '买房';
      if (p.regex === /买车/) title = '买车';
      if (p.regex === /(?:开|创)(?:公司|代运营公司)/) title = '创立代运营公司';
      if (title.length > 20) title = title.substring(0, 20);

      // 去重
      const exists = db.prepare("SELECT id FROM goals WHERE user_id=? AND title LIKE ?").get(userId, title + '%');
      if (exists) continue;

      const dimId = dimMap[p.dim]?.id;
      if (!dimId) continue;

      const now = new Date();
      const deadline = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0]; // 默认年底

      db.prepare(
        'INSERT INTO goals (id, user_id, dimension_id, title, description, target_value, unit, deadline, priority) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(uid(), userId, dimId, title, '自动从对话中提取', targetValue, p.unit, deadline, 'high');

      console.log(`🎯 自动目标: ${title} ${targetValue||''}${p.unit||''}`);
    }
  } catch (e) {
    console.error('autoExtractGoals:', e.message);
  }
}

// 同步消息处理
async function processMessageSync(db, userId, wxid, msg) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const today = new Date().toISOString().split('T')[0];

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
    let extra = streaks.includes(streak) ? `\n连续打卡${streak}天！` : '';
    return { reply: `打卡成功！${detail} +${exp}EXP +${coins}金币${extra}` };
  }

  // 状态查询
  if (/^(状态|统计|我的|进度)/.test(msg)) {
    const c = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(userId, today);
    const t = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'completed' AND scheduled_date = ?").get(userId, today);
    return { reply: `${user.username} 状态\nLv.${user.level} | EXP ${user.exp} | 金币${user.coins}\n连续${user.consecutive_sign_days}天 | 今日打卡${c.c}次 | 完成${t.c}个任务` };
  }

  // 帮助
  if (/^(帮助|help|怎么用)/.test(msg)) {
    return { reply: '打卡：发「打卡 跑步」\n查看：发「状态」\n聊天：随便说' };
  }

  // 默认：调用AI智能回复
  try {
    const { chatWithLLM, chatWithTools, buildSystemPrompt, loadSessionState, saveSessionState } = await import('../services/ai-engine.js');

    // 保存用户消息到聊天历史
    db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', ?)").run(userId, safeSlice(msg, 500));

    // 加载最近对话（过滤猫角色扮演污染，扩展上下文窗口到30条）
    const rawHistory = db.prepare(
      "SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 30"
    ).all(userId).reverse();

    const blockedWords = ['喵~', '喵！', '喵呜', '呼噜', '尾巴', '爪子', '猫粮', '罐罐', '猫爪', '毛团', '鱼干'];
    const recentHistory = rawHistory.filter(h =>
      !blockedWords.some(w => (h.content || '').includes(w))
    );

    // 自动从对话提取档案（只要关键字段还空就持续补，不依赖 onboarding_completed）
    let profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
    const needsSave = !profile || !profile.birth_year || !profile.height_cm || !profile.weight_kg || !profile.current_job;
    if (needsSave) {
      profile = autoSaveProfile(db, userId, recentHistory, user);
    }

    const context = {
      completedToday: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(userId, today)?.c || 0,
      checkinsToday: db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(userId, today)?.c || 0,
      todayTasks: db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status != 'completed'").get(userId, today)?.c || 0,
    };

    // 加载语义记忆上下文（替代关键词匹配，用标签语义检索）
    try {
      const { getSemanticContextMemories } = await import('../services/memory-system.js');
      const semanticMemories = await getSemanticContextMemories(db, userId, msg, 8);
      if (semanticMemories?._semantic) {
        context.importantMemories = semanticMemories.all.map(m => ({
          title: m.title, summary: m.summary || m.content?.slice(0, 100)
        }));
      }
    } catch {}

    // 加载 LLM 会话连续性状态
    const sessionState = loadSessionState(userId);

    const systemPrompt = buildSystemPrompt(user, profile, context, user.personality_type || 'encouraging', sessionState);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory.slice(-8),
    ];

    // 注入情绪洞察
    try {
      const emotion = await analyzeEmotionDeep(msg, recentHistory, userId);
      if (emotion?.subtext) {
        messages.splice(1, 0, { role: 'system', content: `[情绪洞察] 用户说"${safeSlice(msg, 30)}..."，潜台词可能是：${emotion.subtext}。主情绪：${emotion.emotion}(${emotion.intensity}/5)。建议语气：${emotion.suggestedTone}` });
      }
    } catch {}

    // 优先用 Function Calling（带工具），降级到纯文本
    let aiReply;
    try {
      const toolResult = await chatWithTools(messages, { temperature: 0.75, maxTokens: 600 }, db, userId);
      aiReply = toolResult.text;
    } catch {}
    if (!aiReply) {
      aiReply = await chatWithLLM(messages, { temperature: 0.75, maxTokens: 600 });
    }

    if (aiReply) {
      db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'assistant', ?)").run(userId, safeSlice(aiReply, 1000));
      
      // 保存会话状态，确保下次对话有连续性
      saveSessionState(userId, msg, aiReply);

      return aiReply.trim();
    }
  } catch (e) {
    console.error('AI chat error:', e.message);
  }

  // AI失败兜底
  const replies = ['在呢', '收到', '有什么我能帮你的？'];
  return { reply: replies[Math.floor(Math.random() * replies.length)] };
}

// 手动发送消息（写入待发送队列）
router.post('/send', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'no message' });
    db.prepare('INSERT INTO pending_wechat_msgs (id, user_id, message, status) VALUES (?, ?, ?, ?)')
      .run(Date.now().toString(36) + Math.random().toString(36).slice(2, 8), user.id, message, 'pending');
    res.json({ ret: 0, msg: 'queued' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 轮询待发送消息
router.get('/poll-outbox', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const msgs = db.prepare("SELECT id, message FROM pending_wechat_msgs WHERE user_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 3")
      .all(user.id);
    msgs.forEach(m => db.prepare("UPDATE pending_wechat_msgs SET status='sent' WHERE id=?").run(m.id));
    res.json({ messages: msgs.map(m => m.message) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 微信Hook状态
router.get('/hook-status', async (req, res) => {
  try {
    const status = await wechatService.checkStatus();
    res.json(status);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 微信链路健康监控
router.get('/health', (req, res) => {
  const status = getAllStatus();
  const alerts = getAlerts(10);
  res.json({ ...status, alerts });
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
