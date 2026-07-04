// 猫猫侠 结构化日志系统
import { existsSync, mkdirSync, appendFileSync, statSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '..', '..', 'logs');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };
let minLevel = LEVELS[process.env.LOG_LEVEL || 'info'] || 1;

function getLogFile() {
  return join(LOG_DIR, `app.log`);
}

function rotateIfNeeded() {
  const file = getLogFile();
  if (!existsSync(file)) return;
  try {
    const stats = statSync(file);
    if (stats.size > MAX_LOG_SIZE) {
      const rotated = join(LOG_DIR, `app-${Date.now()}.log`);
      renameSync(file, rotated);
    }
  } catch {}
}

function formatLog(level, message, data, context) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context ? { context } : {}),
    ...(data ? { data } : {}),
  };
  return JSON.stringify(entry);
}

function writeLog(level, message, data, context) {
  if (LEVELS[level] < minLevel) return;
  rotateIfNeeded();
  const line = formatLog(level, message, data, context) + '\n';
  try { appendFileSync(getLogFile(), line); } catch {}
  // 控制台输出
  const prefix = { debug: '🔍', info: '📋', warn: '⚠️', error: '❌', fatal: '💀' }[level] || '📋';
  const consoleMsg = `${prefix} [${level.toUpperCase()}] ${message}`;
  if (level === 'error' || level === 'fatal') console.error(consoleMsg, data || '');
  else if (level === 'warn') console.warn(consoleMsg, data || '');
  else if (level !== 'debug' || process.env.DEBUG) console.log(consoleMsg, data || '');
}

export const logger = {
  debug: (msg, data, ctx) => writeLog('debug', msg, data, ctx),
  info: (msg, data, ctx) => writeLog('info', msg, data, ctx),
  warn: (msg, data, ctx) => writeLog('warn', msg, data, ctx),
  error: (msg, data, ctx) => writeLog('error', msg, data, ctx),
  fatal: (msg, data, ctx) => writeLog('fatal', msg, data, ctx),

  // Express中间件
  middleware() {
    return (req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
        writeLog(level, `${req.method} ${req.path} ${res.statusCode} ${duration}ms`, {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration,
          ip: req.ip,
        });
      });
      next();
    };
  },

  setLevel(level) { minLevel = LEVELS[level] || 1; },
};
