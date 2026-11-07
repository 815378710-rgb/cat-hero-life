# 猫猫侠 - AI人生管理系统
# 目标平台：群晖 DS220+ / x86_64
# 注：NAS 上 dl-cdn.alpinelinux.org 不可达（实测 4s 超时 0 字节），必须换国内源，
#     否则 apk add 会静默卡死。见 .workbuddy 踩坑记录。

FROM node:22-alpine

# 国内 apk 镜像源（必须在任何 apk add 之前）
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories

WORKDIR /app

# 时区
RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && echo "Asia/Shanghai" > /etc/timezone

# better-sqlite3 需要原生编译（alpine/musl 无预编译包）
RUN apk add --no-cache --virtual .build-deps python3 make g++

# 依赖层：package.json 未变时命中缓存，不重复安装
# 用 npm ci 而非 install：严格按 lock 安装，不做版本求解，可复现性更好。
# 注：本机曾出现 npm install 报 "Exit handler never called" 而失败，原因未确认。
#     不要臆断为内存不足——实测 NAS 有 17.8GB 内存 / 15GB 可用。
COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com \
    && npm ci --omit=dev --no-audit --no-fund \
    && npm config delete registry \
    && npm cache clean --force

RUN apk del .build-deps

# 运行时文件
COPY server/ ./server/
COPY dist/ ./dist/

RUN mkdir -p data logs

ENV NODE_ENV=production \
    TZ=Asia/Shanghai

EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=10s --start-period=40s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/system/health || exit 1

CMD ["node", "server/index.js"]
