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

线上地址 <https://life.maomaoxia.top>，跑在群晖 NAS 的 Docker 里。

**部署链路（推荐）**

```bash
export NAS_HOST=192.168.68.161
export NAS_USER=maomaoxia
export NAS_PASS=******

python scripts/deploy.py all      # 构建前端 → 上传 → 构建镜像 → 重建容器 → 健康检查
```

其它子命令：

| 命令 | 作用 |
|---|---|
| `deploy.py build` | 只构建前端（产物写入 `dist/`）|
| `deploy.py upload` | 只上传代码，不重启服务 |
| `deploy.py image` | 只在 NAS 上构建镜像 |
| `deploy.py restart` | 只重建容器（用现有镜像）|
| `deploy.py rollback` | 回滚到上一版容器 |

健康检查失败会自动回滚，无需手动介入。

**本机直接跑**

```bash
npm run build:frontend
npm start
```

打开 http://localhost:3000

> ⚠️ **`dist/` 已纳入版本库**，作为「已验证发布产物」——这样任意 commit 都能免构建直接部署（NAS 编译前端较慢）。
> 因此**改完前端必须执行 `npm run build:frontend` 并一并提交**，否则源码与产物会不一致。

### 部署环境注意

- **NAS 上 alpine 官方源不可达**，Dockerfile 已改用阿里云镜像源；否则 `apk add` 会静默卡死
- 数据全部落在宿主 `/volume1/projects/cat-hero-life/data`，容器内不存任何持久数据
- 日志驱动沿用群晖默认（`db`），不要在 compose 里覆盖为 `json-file`

### 访问口令（2026-11-07 启用）

站点部署在公网，此前所有 `/api/*` 完全开放。现已加访问口令保护：

- 首次启动自动生成随机口令，写入 `data/access_token.txt`（宿主挂载卷，重建容器不丢）
- 也可通过环境变量 `CAT_HERO_ACCESS_TOKEN` 显式指定
- 浏览器首次访问输入一次，写入 HttpOnly Cookie，保留 30 天
- 白名单：`/api/system/health`、`/api/unlock`、微信/飞书回调；
  可用 `CAT_HERO_PUBLIC_PATHS`（逗号分隔）追加
- **应急关闭**：`CAT_HERO_ACCESS_GUARD=off`

> ⚠️ `accessGuard` 必须挂在 `responseCache` 之前。响应缓存命中会直接 `res.json()` 返回，
> 若 guard 排在后面，缓存命中即绕过鉴权（灰度验证实测发现过该漏洞）。

### 角色化体验（2026-11-07）

参考社区项目 `whyever77/dafeiyu-astrbot`（MIT）与 `EDMOK/blue-fish-archive`，
分三阶段把工具型系统改造成有角色的陪伴体验。

| 阶段 | 内容 | 入口 |
|---|---|---|
| 1 · 换灵魂 | 可插拔人格（`server/persona/`），默认「阿蓝 🐋」，`CAT_HERO_PERSONA=cat-hero` 可切回猫猫侠 | 全站 AI 输出 |
| 2 · 她的房间 | 昼夜窗景 + 原创蓝鲸娘状态动画 + 真实 `ai_memory` 记忆星海（纯 SVG，无外部立绘） | `/room` |
| 3 · 档案馆 | 卡通贴纸风瀑布流、大图翻页、复制/下载原图、支持 GIF/WebP/APNG | `/archive` |

人格的三条硬约束：**有脾气但不索取关注**、**不编造经历**（没调工具不说已安排）、
**记忆有边界**（"以前说过但找不到" ≠ "从没发生过"）。详见 `server/persona/README.md`。

档案馆默认展示 8 张**内置原创 SVG 示例贴纸**，不预置任何第三方表情包。
换成自己的图片：放入 `dist/archive/media/`，在 `dist/archive/media.json` 的 `items` 里登记。

> 版权：大肥鱼是 DeepSeek 蓝鲸的社区二创（非官方）。本项目人格文本为原创改写并注明出处，
> 未使用上游立绘、头像、精灵图或音色素材。角色名「阿蓝」为本项目原创。

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
