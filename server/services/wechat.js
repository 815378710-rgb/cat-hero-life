// 微信机器人服务 - 基于 WeChat-Hook
// 防封设计：消息限流 + 随机延迟 + 新设备冷却 + 自然回复节奏

import config from '../config/wechat.js';

class WeChatService {
  constructor() {
    this.db = null;
    this.messageQueue = [];
    this.processing = false;
    this.lastMessageTime = 0;
    this.hourCount = 0;
    this.dayCount = 0;
    this.hourReset = Date.now();
    this.dayReset = Date.now();
    this.startTime = Date.now();
    
    // 回复模板 - 增加自然变异
    this.greetingTemplates = [
      '{}好呀~ 🐱',
      '{}，我在呢~',
      '喵！{}来了~',
      '{}有什么事吗？🐱',
    ];
    this.checkinConfirmTemplates = [
      '🎉 打卡成功！{}完成，+{}EXP +{}金币',
      '✅ 收到！{}已记录，继续加油~',
      '📝 记下了！{}，今天又进步了一点',
    ];
  }

  setDb(db) { this.db = db; }

  // ===== 防封核心：消息限流 =====
  
  async waitForSlot() {
    const now = Date.now();
    const { minMessageInterval, randomDelayMin, randomDelayMax, maxMessagesPerHour, maxMessagesPerDay, agingPeriodDays } = config.antiBan;

    // 新设备冷却检查
    const hoursSinceStart = (now - this.startTime) / 3600000;
    const daysSinceStart = hoursSinceStart / 24;
    if (daysSinceStart < agingPeriodDays && this.dayCount > 10) {
      // 新设备限制：前2天每天最多10条
      const waitTime = 3600000; // 等1小时
      console.log(`[微信] 新设备冷却中，等待${Math.round(waitTime/60000)}分钟...`);
      await new Promise(r => setTimeout(r, waitTime));
    }

    // 每小时重置
    if (now - this.hourReset > 3600000) {
      this.hourCount = 0;
      this.hourReset = now;
    }

    // 每天重置
    if (now - this.dayReset > 86400000) {
      this.dayCount = 0;
      this.dayReset = now;
    }

    // 检查限制
    if (this.hourCount >= maxMessagesPerHour) {
      const waitMs = 3600000 - (now - this.hourReset);
      console.log(`[微信] 小时限制(${maxMessagesPerHour}条)，等待${Math.round(waitMs/60000)}分钟`);
      await new Promise(r => setTimeout(r, Math.min(waitMs, 3600000)));
      return this.waitForSlot(); // 重试
    }

    if (this.dayCount >= maxMessagesPerDay) {
      console.log('[微信] 已达每日限制，明天再发');
      throw new Error('DAILY_LIMIT_REACHED');
    }

    // 最小间隔 + 随机延迟
    const elapsed = now - this.lastMessageTime;
    const minWait = Math.max(0, minMessageInterval - elapsed);
    const randomExtra = randomDelayMin + Math.random() * (randomDelayMax - randomDelayMin);
    const totalWait = minWait + randomExtra;

    if (totalWait > 0) {
      await new Promise(r => setTimeout(r, totalWait));
    }

    this.lastMessageTime = Date.now();
    this.hourCount++;
    this.dayCount++;
  }

  // ===== 核心：发送消息 =====

  async sendText(wxid, message) {
    if (!message || !wxid) return { ret: -1, retmsg: '参数错误' };
    
    try {
      await this.waitForSlot();
      
      const url = `${config.baseUrl}/SendTextMsg`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wxidorgid: wxid, msg: message }),
        signal: AbortSignal.timeout(10000)
      });
      
      const result = await response.json();
      
      // 记录日志
      if (this.db) {
        try {
          this.db.prepare(
            "INSERT INTO wechat_logs (user_id, wxid, type, content, status) VALUES (?, ?, 'send', ?, ?)"
          ).run('system', wxid, message.slice(0, 200), result.ret === 0 ? 'success' : 'failed');
        } catch (e) {}
      }
      
      console.log(`[微信] 发送消息给 ${wxid}: ${message.slice(0, 50)}${message.length > 50 ? '...' : ''}`);
      return result;
    } catch (e) {
      console.error('[微信] 发送失败:', e.message);
      return { ret: -1, retmsg: e.message };
    }
  }

  async sendImage(wxid, imagePath) {
    try {
      await this.waitForSlot();
      
      const url = `${config.baseUrl}/SendImgMsg`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wxidorgid: wxid, path: imagePath }),
        signal: AbortSignal.timeout(15000)
      });
      
      return await response.json();
    } catch (e) {
      console.error('[微信] 发送图片失败:', e.message);
      return { ret: -1, retmsg: e.message };
    }
  }

  // ===== 健康检查 =====

  async checkStatus() {
    try {
      const url = `${config.baseUrl}/QueryDB/status`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      return { online: data.IsLogin === 1, data };
    } catch (e) {
      return { online: false, error: e.message };
    }
  }

  // ===== 获取个人资料 =====

  async getProfile() {
    try {
      const url = `${config.baseUrl}/GetSelfProfile`;
      const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(5000) });
      return await response.json();
    } catch (e) {
      return null;
    }
  }

  // ===== 智能回复 =====

  async handleIncomingMessage(db, userId, wxid, content) {
    // 白名单/黑名单过滤
    if (config.blacklist.length > 0 && config.blacklist.includes(wxid)) return;
    if (config.whitelist.length > 0 && !config.whitelist.includes(wxid)) return;

    // 记录收到消息
    try {
      db.prepare("INSERT INTO wechat_logs (user_id, wxid, type, content, status) VALUES (?, ?, 'receive', ?, 'received')")
        .run(userId, wxid, content.slice(0, 200));
    } catch (e) {}

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const msg = content.trim();

    // ===== 打卡命令 =====
    const checkinPatterns = [
      /^打卡\s*(.+)?/,
      /^完成\s*(.+)?/,
      /^做了?\s*(.+)/,
      /^跑了?\s*(.+)/,
      /^读了?\s*(.+)/,
      /^学了?\s*(.+)/,
      /^锻炼\s*(.+)?/,
    ];

    for (const pattern of checkinPatterns) {
      const match = msg.match(pattern);
      if (match) {
        const detail = match[1] || '今日打卡';
        return await this.processCheckin(db, userId, wxid, detail);
      }
    }

    // ===== 查询命令 =====
    if (/^(状态|我的|统计|进度|查看)/.test(msg)) {
      return await this.processStatusQuery(db, userId, wxid, user);
    }

    // ===== 帮助命令 =====
    if (/^(帮助|help|怎么用|功能)/.test(msg)) {
      return await this.sendText(wxid, 
        '🐱 猫猫侠微信助手\n\n' +
        '📝 打卡：发送「打卡 运动了30分钟」\n' +
        '📊 查看：发送「状态」或「统计」\n' +
        '💬 聊天：直接发消息跟我聊\n' +
        `当前：Lv.${user.level} | 🪙${user.coins} | 🔥${user.consecutive_sign_days}天`
      );
    }

    // ===== AI对话 =====
    if (config.features.aiChat) {
      return await this.processAIChat(db, userId, wxid, content);
    }

    // 默认回复
    const greeting = this.greetingTemplates[Math.floor(Math.random() * this.greetingTemplates.length)];
    return await this.sendText(wxid, greeting.replace('{}', user.username || '主人'));
  }

  // ===== 处理打卡 =====
  async processCheckin(db, userId, wxid, detail) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const today = new Date().toISOString().split('T')[0];
    const { v4: uuid } = await import('uuid');

    // 推断维度
    const dimensionMap = {
      '运动': 'health', '跑': 'health', '锻炼': 'health', '健身': 'health',
      '读书': 'learning', '学': 'learning', '课': 'learning', '写': 'creativity',
      '工作': 'career', '加班': 'career', '会议': 'career',
      '社交': 'social', '朋友': 'social', '聚': 'social',
      '冥想': 'mental', '情绪': 'mental', '心情': 'mental',
      '理财': 'finance', '定投': 'finance', '记账': 'finance', '支出': 'finance',
    };

    let dimensionId = 'habits';
    for (const [keyword, dim] of Object.entries(dimensionMap)) {
      if (detail.includes(keyword)) { dimensionId = dim; break; }
    }

    // 创建打卡记录
    const id = uuid();
    db.prepare(
      "INSERT INTO check_ins (id, user_id, dimension_id, check_type, title, note, checked_at) VALUES (?, ?, ?, 'manual', ?, ?, datetime('now'))"
    ).run(id, userId, dimensionId, detail, detail);

    // 计算奖励
    const expReward = 10 + Math.floor(Math.random() * 6); // 10-15
    const coinReward = 5 + Math.floor(Math.random() * 4);  // 5-8

    // 更新用户数据
    const statField = `stat_${dimensionId}`;
    db.prepare(`UPDATE users SET ${statField} = MIN(${statField} + 2, 100), exp = exp + ?, coins = coins + ?, updated_at = datetime('now') WHERE id = ?`)
      .run(expReward, coinReward, userId);

    // 更新连续签到
    if (user.last_sign_date !== today) {
      db.prepare("UPDATE users SET consecutive_sign_days = consecutive_sign_days + 1, last_sign_date = ? WHERE id = ?")
        .run(today, userId);
    }

    // 回复
    const template = this.checkinConfirmTemplates[Math.floor(Math.random() * this.checkinConfirmTemplates.length)];
    let reply = template.replace('{}', detail).replace('{}', String(expReward)).replace('{}', String(coinReward));

    // 连续打卡鼓励
    const newStreak = user.consecutive_sign_days + 1;
    if (config.features.streakEncouragement && config.antiBan?.streakMilestones) {
      const milestones = config.features.streakMilestones || [3, 7, 14, 21, 30, 60, 100];
      if (milestones.includes(newStreak)) {
        reply += `\n\n🔥 连续打卡${newStreak}天！你太棒了！`;
      }
    }

    return await this.sendText(wxid, reply);
  }

  // ===== 处理状态查询 =====
  async processStatusQuery(db, userId, wxid, user) {
    const today = new Date().toISOString().split('T')[0];
    const todayCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(userId, today);
    const pendingTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'pending' AND scheduled_date = ?").get(userId, today);
    const completedTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'completed' AND scheduled_date = ?").get(userId, today);

    const stats = `🐱 ${user.username} 的状态报告

⭐ Lv.${user.level} | EXP ${user.exp} | 🪙${user.coins}
🔥 连续签到 ${user.consecutive_sign_days} 天
📝 今日打卡 ${todayCheckins.c} 次
✅ 完成任务 ${completedTasks.c}/${pendingTasks.c + completedTasks.c}

💪 健康 ${user.stat_health} | 💰 财务 ${user.stat_finance}
📚 学习 ${user.stat_learning} | 🚀 职业 ${user.stat_career}
🤝 社交 ${user.stat_social} | 🧠 心理 ${user.stat_mental}
🎯 习惯 ${user.stat_habits} | 🎨 创造 ${user.stat_creativity}`;

    return await this.sendText(wxid, stats);
  }

  // ===== 处理AI对话 =====
  async processAIChat(db, userId, wxid, message) {
    try {
      // 保存用户消息
      db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'user', ?)").run(userId, message);

      // 使用规则引擎快速回复（避免API延迟）
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      const today = new Date().toISOString().split('T')[0];
      const context = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(userId, today);

      const replies = [
        `喵~ ${user.username}，今天打卡了${context.c}次，Lv.${user.level}。有什么我能帮你的？`,
        `${user.username}好~ 连续${user.consecutive_sign_days}天打卡！继续保持哦！`,
        `在呢在呢~ 🐱 需要我提醒你什么吗？`,
      ];

      const reply = replies[Math.floor(Math.random() * replies.length)];
      
      // 保存AI回复
      db.prepare("INSERT INTO chat_history (user_id, role, content) VALUES (?, 'assistant', ?)").run(userId, reply);

      return await this.sendText(wxid, reply);
    } catch (e) {
      return await this.sendText(wxid, '抱歉，我暂时无法回复~ 请稍后再试 🐱');
    }
  }

  // ===== 定时任务：每日提醒 =====
  async dailyReminderCheck(db) {
    if (!config.features.dailyReminder) return;
    
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // 早安提醒
    if (timeStr === config.features.dailyReminderTime) {
      const users = db.prepare("SELECT u.*, w.wxid FROM users u LEFT JOIN wechat_bindings w ON u.id = w.user_id WHERE w.wxid IS NOT NULL AND w.bind_status = 'active'").all();
      
      for (const user of users) {
        try {
          const today = new Date().toISOString().split('T')[0];
          const todayCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(user.id, today);
          
          const greetings = [
            `☀️ ${user.username}早上好！新的一天开始了~ 今天要完成什么目标？`,
            `🌅 ${user.username}，早安！今天也要元气满满哦~ 🐱`,
          ];
          const msg = greetings[Math.floor(Math.random() * greetings.length)];
          
          await this.sendText(user.wxid, msg);
        } catch (e) {
          console.error(`[微信] 发送早安提醒失败(${user.username}):`, e.message);
        }
      }
    }

    // 晚间催促（晚8点）
    if (config.features.lazyReminder && timeStr === config.features.lazyReminderTime) {
      const users = db.prepare("SELECT u.*, w.wxid FROM users u LEFT JOIN wechat_bindings w ON u.id = w.user_id WHERE w.wxid IS NOT NULL AND w.bind_status = 'active'").all();
      
      for (const user of users) {
        try {
          const today = new Date().toISOString().split('T')[0];
          const todayCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(user.id, today);
          
          if (todayCheckins.c < 3) {
            const reminders = [
              `🌙 ${user.username}，今天打卡了${todayCheckins.c}次，还差一点哦~ 睡前再努力一下吧！`,
              `😿 ${user.username}今天有点懈怠呢... 现在开始还来得及！`,
            ];
            const msg = reminders[Math.floor(Math.random() * reminders.length)];
            await this.sendText(user.wxid, msg);
          }
        } catch (e) {
          console.error(`[微信] 发送晚间提醒失败(${user.username}):`, e.message);
        }
      }
    }
  }
}

// 单例
const wechatService = new WeChatService();
export default wechatService;
