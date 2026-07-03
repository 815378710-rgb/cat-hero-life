# 猫猫侠 - AI人生管理系统

## 快速开始

### 安装
```bash
git clone https://github.com/815378710-rgb/cat-hero-life.git
cd cat-hero-life
npm install
cd frontend && npm install
```

### 开发模式
```bash
# 终端1: 启动后端（支持热重载）
npm run dev:backend

# 终端2: 启动前端（支持Vite热更新）
npm run dev:frontend
```
前端开发服务器: http://localhost:5173  
后端API服务器: http://localhost:3000

### 生产部署
```bash
# 构建前端
npm run build:frontend

# 启动后端
npm start
```
打开 http://localhost:3000

### 配置AI
1. 打开设置页
2. 填入DeepSeek API Key
3. 保存

---

## 功能说明

### 🐱 对话式建档
猫猫侠通过聊天了解你，不是填表。说出你的信息，系统自动提取并记录。

### 📋 智能任务
- 系统根据你的档案自动生成每日任务
- 能量低时自动减少任务量
- 任务按时段和难度智能排序

### ✅ 快捷打卡
- 一键打卡功能
- 对话自动提取数据："今天跑了5公里" → 自动记录运动

### 🎮 游戏化
- 等级/经验值/金币
- 33个成就徽章
- 奖励商店（真实奖励+虚拟物品）
- 猫猫侠成长系统

### 📊 数据追踪
8个维度的详细数据：

- **健康**: 身体指标/睡眠/运动/饮食/医疗
- **财务**: 收支/账户/投资/预算
- **学习**: 技能/学习记录/书籍课程
- **职业**: 经历/目标/人脉
- **社交**: 关系清单/社交活动
- **心理**: 情绪日记/冥想
- **创造**: 项目/灵感/产出
- **习惯**: 习惯追踪/连续天数

### 🤖 AI能力
- 大模型对话（DeepSeek/GPT/Claude）
- 情绪感知
- 长期记忆
- 数据自动提取
- 智能预警

### 📖 人生叙事
把你的人生经历编织成小说章节。

### 🔔 定时推送
- 7:30 早安 + 任务生成
- 12:00 午间检查
- 18:00 傍晚关怀
- 21:00 晚间复盘
- 23:00 未完成提醒

---

## 消息通道

### 飞书
1. 在飞书开放平台创建应用
2. 添加权限：im:message:send_as_bot
3. 在设置页填入App ID和App Secret
4. 设置Webhook地址

### 微信（Gewechat）
1. 安装Docker
2. 运行：`docker run -d -p 2531:2531 gewechat/server`
3. 在设置页配置Gewechat地址
4. 扫码登录

---

## 数据备份

- **导出**: 设置页 → 数据导出（CSV/JSON）
- **导入**: 设置页 → 数据导入（JSON）

---

## 技术栈

- **后端**: Node.js + Express + SQLite (sql.js)
- **前端**: Vue 3 + TypeScript + Vite + Chart.js
- **AI**: DeepSeek / GPT / Claude
- **定时任务**: node-cron

---

## 项目结构

```
cat-hero-life/
├── server/                 # 后端代码
│   ├── index.js           # 主入口
│   ├── routes/            # API路由
│   ├── services/          # 业务逻辑
│   └── db/                # 数据库Schema
├── frontend/               # 前端源码（Vue 3 + TypeScript）
│   ├── src/
│   ├── vite.config.ts
│   └── package.json
├── dist/                   # 前端构建输出（由Vite自动生成）
│   ├── index.html
│   └── assets/
├── data/                   # SQLite数据库文件
│   └── cat-hero.db
├── package.json           # 后端依赖
└── README.md
```

---

## 开发指南

### 前端开发
```bash
cd frontend
npm run dev          # 启动Vite开发服务器（热更新）
npm run build        # 构建到 ../dist/
npm run preview      # 预览生产构建
```

### 后端开发
```bash
npm run dev:backend  # 启动后端（--watch模式，自动重启）
npm start            # 生产模式启动
```

### API代理
前端开发服务器（:5173）会自动代理 `/api` 请求到后端（:3000），无需配置CORS。

---

## 许可证

MIT
