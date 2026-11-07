// 访问口令保护（默认关闭）
// 背景：middleware/auth.js（JWT）与 routes/auth.js（登录/注册）都写好了但从未挂载，
// 导致全部 /api/* 对公网开放。本模块采用单访问口令 + HttpOnly Cookie，
// 不引入账号体系、不需要注册，也不要求改写前端已有的上百处 fetch / axios 调用。
// 2026-11-07：按用户要求取消口令，改为默认放行；
//             需要时设置 CAT_HERO_ACCESS_GUARD=on 即可一键恢复。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const TOKEN_FILE = path.join(DATA_DIR, 'access_token.txt');
const COOKIE_NAME = 'ch_access';
const COOKIE_MAX_AGE = 30 * 24 * 3600; // 30 天

let cachedToken = null;

export function getAccessToken() {
  // 1. 环境变量优先（适合生产显式指定、重启不变）
  const fromEnv = process.env.CAT_HERO_ACCESS_TOKEN;
  if (fromEnv) return fromEnv.trim();

  // 2. 内存缓存 / 落盘文件
  if (cachedToken) return cachedToken;
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
      if (t) { cachedToken = t; return t; }
    }
  } catch (e) {
    console.error('[ACCESS] 读取口令文件失败:', e.message);
  }

  // 3. 首次运行：生成随机口令并持久化（data 为宿主挂载卷，重建容器不会丢）
  const generated = crypto.randomBytes(18).toString('base64url');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, generated + '\n', { mode: 0o600 });
    console.log('[ACCESS] 已生成访问口令，文件:', TOKEN_FILE);
  } catch (e) {
    console.error('[ACCESS] 口令落盘失败（重启后会变化）:', e.message);
  }
  cachedToken = generated;
  return generated;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// 无需口令的路径：健康检查、解锁端点、以及外部服务无法携带 Cookie 的回调
const PUBLIC_PREFIXES = [
  '/api/system/health',
  '/api/unlock',
  '/api/wechat-bot/callback',
  '/api/wechat-bot/poll',
  '/api/wechat-bot/health',
  '/api/gewechat/',
  '/api/feishu/webhook',
];

export function accessGuard(req, res, next) {
  // 默认关闭：不设环境变量即完全放行。
  // 需保护时设置 CAT_HERO_ACCESS_GUARD=on；CAT_HERO_ACCESS_GUARD=off 为显式关闭。
  if (process.env.CAT_HERO_ACCESS_GUARD !== 'on') return next();

  const p = req.path || req.originalUrl || '';
  if (!p.startsWith('/api/')) return next();          // 静态资源、SPA 页面不拦
  if (PUBLIC_PREFIXES.some(x => p === x || p.startsWith(x))) return next();

  // 环境变量可追加白名单（逗号分隔）
  const extra = (process.env.CAT_HERO_PUBLIC_PATHS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (extra.some(x => p.startsWith(x))) return next();

  const token = getAccessToken();
  const fromCookie = parseCookies(req.headers.cookie)[COOKIE_NAME];
  const fromHeader = req.headers['x-access-token'];
  if (safeEqual(fromCookie, token) || safeEqual(fromHeader, token)) return next();

  return res.status(401).json({ error: '需要访问口令', needUnlock: true });
}

// 解锁端点：校验口令后下发 HttpOnly Cookie
export function unlockHandler(req, res) {
  const token = getAccessToken();
  const provided = (req.body && (req.body.token ?? req.body.password)) || req.headers['x-access-token'];
  if (!safeEqual(provided, token)) {
    return res.status(403).json({ error: '口令错误' });
  }
  // 不设 Secure：内网 http 访问也需要能带上；公网由 Cloudflare 提供 TLS
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`);
  return res.json({ success: true });
}

export { COOKIE_NAME };
