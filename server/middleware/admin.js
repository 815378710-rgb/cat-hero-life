// 管理员令牌中间件 (审计 #16 P0)
// 用于保护高敏感写接口: /api/backup(下载) / PUT /api/ai/config / POST /api/deep/import
// 令牌来源优先级: 环境变量 CAT_HERO_ADMIN_TOKEN > 持久化文件 data/admin_token.txt > 首次运行自动生成并落盘
// 设计: 失败安全 — 缺省即生成, 但必须满足令牌匹配才会放行, 杜绝匿名访问。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const TOKEN_FILE = path.join(DATA_DIR, 'admin_token.txt');

let cachedToken = null;

export function getAdminToken() {
  // 1. 环境变量优先(最适合生产部署, 可重启不变)
  if (process.env.CAT_HERO_ADMIN_TOKEN) return process.env.CAT_HERO_ADMIN_TOKEN;

  // 2. 内存缓存 / 已落盘文件
  if (cachedToken) return cachedToken;
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const t = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
      if (t) { cachedToken = t; return cachedToken; }
    }
  } catch (e) {
    console.error('[ADMIN] 读取 token 文件失败:', e.message);
  }

  // 3. 首次运行自动生成并持久化(权限 0600)
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    cachedToken = crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(TOKEN_FILE, cachedToken, { mode: 0o600 });
    console.warn(
      '\x1b[33m[ADMIN] 未设置 CAT_HERO_ADMIN_TOKEN，已自动生成管理员令牌并保存到:\n' +
      `        ${TOKEN_FILE}\n` +
      '        请在「设置 → 系统管理」中填入该令牌(或将环境变量 CAT_HERO_ADMIN_TOKEN 设为相同值)以使用备份/导入/AI配置功能。\x1b[0m'
    );
  } catch (e) {
    // 兜底: 内存令牌(进程重启即失效, 仅用于保证接口不被匿名访问)
    cachedToken = cachedToken || crypto.randomBytes(24).toString('hex');
    console.error('[ADMIN] 无法写入 token 文件，使用内存令牌(重启失效):', e.message);
  }
  return cachedToken;
}

// 中间件: 校验 x-admin-token 头 或 adminToken 查询参数 或 Authorization: Bearer
export function adminMiddleware(req, res, next) {
  const expected = getAdminToken();
  const headerToken =
    req.headers['x-admin-token'] ||
    (req.headers['authorization'] && String(req.headers['authorization']).startsWith('Bearer ')
      ? String(req.headers['authorization']).slice(7)
      : null);
  const queryToken = req.query && req.query.adminToken;

  if (headerToken === expected || queryToken === expected) return next();

  return res.status(401).json({ error: '管理员令牌无效或未提供，拒绝访问' });
}
