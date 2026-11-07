// WeChat-Hook 集成配置
// WeChat-Hook 项目地址: https://github.com/aixed/WeChat-Hook
// 将编译好的 version.dll 放到微信安装目录，启动微信后自动暴露 HTTP API

export default {
  // WeChat-Hook HTTP 服务地址（Windows 机器内网IP）
  host: process.env.WECHAT_HOST || '127.0.0.1',
  port: process.env.WECHAT_PORT || 30001,
  get baseUrl() { return `http://${this.host}:${this.port}` },

  // 防封配置
  antiBan: {
    // 新设备冷却期（天）- Gewechat 经验：新设备挂几天再频繁用
    agingPeriodDays: 2,
    
    // 消息间隔（毫秒）- 两条消息之间最小间隔
    minMessageInterval: 2000,
    
    // 随机延迟范围（毫秒）- 再追加随机延迟，模拟真人
    randomDelayMin: 500,
    randomDelayMax: 3000,
    
    // 每小时最大消息数
    maxMessagesPerHour: 60,
    
    // 每日最大消息数
    maxMessagesPerDay: 200,
    
    // 回复延迟（毫秒）- 收到消息后不立即回复，模拟真人打字
    replyDelayMin: 1000,
    replyDelayMax: 4000,
  },

  // 功能开关
  features: {
    // 每日打卡提醒
    dailyReminder: true,
    dailyReminderTime: '09:00',  // 北京时间
    
    // 连续打卡鼓励
    streakEncouragement: true,
    streakMilestones: [3, 7, 14, 21, 30, 60, 100],
    
    // 未打卡催促
    lazyReminder: true,
    lazyReminderTime: '20:00',   // 晚8点检查
    
    // AI对话
    aiChat: true,
    
    // 习惯提醒
    habitReminder: true,
  },

  // 白名单 - 只有这些用户的消息会被处理（留空=全部）
  whitelist: [],
  
  // 黑名单用户（忽略消息）
  blacklist: [],
}
