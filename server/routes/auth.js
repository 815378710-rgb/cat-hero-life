// 认证路由：登录 / 注册 / Token 验证
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { generateToken, verifyToken } from '../middleware/auth.js';

const router = Router();
const SALT_ROUNDS = 10;

// 注册（首次使用）
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || password.length < 6) {
      return res.status(400).json({ error: '用户名和密码至少6位' });
    }

    const db = req.db;
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const userId = uuid();
    const now = new Date().toISOString();

    db.prepare(`INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
      .run(userId, username, hashed, now, now);

    // 创建默认 life_profile
    db.prepare(`INSERT OR IGNORE INTO life_profile (user_id) VALUES (?)`).run(userId);

    const token = generateToken(userId);
    res.json({ success: true, token, userId, username });
  } catch (e) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const db = req.db;
    const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = generateToken(user.id);
    res.json({ success: true, token, userId: user.id, username: user.username });
  } catch (e) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 验证 token 有效性
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false });
  }
  const decoded = verifyToken(authHeader.slice(7));
  if (!decoded) {
    return res.status(401).json({ valid: false });
  }
  res.json({ valid: true, userId: decoded.userId });
});

export default router;
