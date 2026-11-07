// JWT 鉴权中间件
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.CAT_HERO_JWT_SECRET || 'cat-hero-life-default-secret-change-me';
const JWT_EXPIRES = '7d';

// 生成 token
export function generateToken(userId) {
  return jwt.sign({ userId, iat: Math.floor(Date.now() / 1000) }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// 验证 token
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    console.error('[Auth] JWT verify failed:', e.message);
    return null;
  }
}

// 鉴权中间件：保护 /api/ 路由
export function authMiddleware(req, res, next) {
  const path = req.originalUrl || req.path;
  
  // 非 API 路径跳过
  if (!path.startsWith('/api/')) return next();

  // 健康检查、登录、注册等公开端点跳过鉴权
  const publicPaths = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/system/health',
    '/api/wechat-bot/callback',
    '/api/wechat-bot/poll',
    '/api/wechat-bot/health',
    '/api/gewechat',
    '/api/feishu',
  ];

  const isPublic = publicPaths.some(p => path === p || path.startsWith(p + '/'));
  if (isPublic) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }

  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }

  req.userId = decoded.userId;
  next();
}

export default authMiddleware;
