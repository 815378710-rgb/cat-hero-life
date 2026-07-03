#!/bin/bash
# 猫猫侠 - 一键部署脚本

echo "🐱 猫猫侠 AI人生管理系统 - 部署脚本"
echo "=========================================="

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未安装Node.js，请先安装Node.js 18+"
    exit 1
fi

echo "✅ Node.js $(node -v)"

# 安装依赖
echo ""
echo "📦 安装依赖..."
npm install --production 2>&1 | tail -3

# 创建数据目录
mkdir -p data

# 启动
echo ""
echo "🚀 启动猫猫侠..."
echo "   访问地址: http://localhost:3000"
echo "   按 Ctrl+C 停止"
echo ""

npm start
