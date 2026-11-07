import { Router } from 'express';
import crypto from 'crypto';
import { setAiConfig, getAiConfig, isAiEnabled, DEFAULT_MODEL } from '../services/ai-engine.js';

const router = Router();

// ===== API Key 加密存储 =====
// 数据库里存密文，格式 ivB64:tagB64:dataB64（AES-256-GCM）
// 密钥来源：环境变量 CAT_HERO_ENCRYPTION_KEY，未设置时用默认值
const ENC_KEY = Buffer.from(
  (process.env.CAT_HERO_ENCRYPTION_KEY || 'cat-hero-life-default-encryption-key-change-me')
    .padEnd(32, '0').slice(0, 32)
);

function encryptApiKey(plain) {
  if (!plain) return '';
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
  } catch (e) {
    console.error('[AIConfig] API Key 加密失败:', e.message);
    return '';
  }
}

export function decryptApiKey(payload) {
  if (!payload) return '';
  const raw = String(payload);
  // 兼容历史遗留明文（如 sk-xxx，无冒号分段）
  if (raw.split(':').length === 1) return raw;
  try {
    const [ivB64, tagB64, dataB64] = raw.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return raw;
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('[AIConfig] API Key 解密失败:', e.message);
    return '';
  }
}

// 脱敏展示：sk-5637bd1xxxxxxxxxxxxxxxxxxb52cc0 -> sk-5637••••••••cc0
function maskKey(k) {
  if (!k) return '未配置';
  if (k.length <= 10) return k.slice(0, 3) + '••••';
  return k.slice(0, 6) + '••••••••' + k.slice(-4);
}

// 库里时间戳是 UTC（datetime('now')），这里转成北京时间再给前端，避免误读
function toBeijing(ts) {
  if (!ts) return null;
  const t = Date.parse(String(ts).replace(' ', 'T') + 'Z');
  if (isNaN(t)) return String(ts);
  const d = new Date(t + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

router.get('/config', (req, res) => {
  const cfg = getAiConfig();
  let row = null, plainKey = '';
  try {
    const db = req.db;
    row = db.prepare('SELECT provider, api_key, model, updated_at FROM ai_config LIMIT 1').get();
    if (row && row.api_key) plainKey = decryptApiKey(row.api_key);
  } catch (e) {
    console.error('[AIConfig] 读取配置详情失败:', e.message);
  }
  res.json({
    config: {
      ...cfg,
      // 让前端能显示"当前配置记录"
      apiKeyMasked: maskKey(plainKey),
      apiKeyLength: plainKey ? plainKey.length : 0,
      apiKeySource: row && row.api_key ? 'database' : (process.env.AI_API_KEY ? 'env' : 'none'),
      actualModel: cfg.model,                    // 引擎真正发出去的模型
      modelLocked: true,                         // 统一固定为多模态 Flash
      storedModel: DEFAULT_MODEL,                // 数据库存档值（保存时已对齐）
      updatedAt: row ? toBeijing(row.updated_at) : null
    },
    enabled: isAiEnabled()
  });
});

router.put('/config', (req, res) => {
  const db = req.db;
  try {
    let { provider, apiKey } = req.body;
    // 模型统一固定为多模态 Flash（不从前端表单取值，避免被改回旧模型）
    const model = DEFAULT_MODEL;
    
    // 清理API Key
    if (apiKey) {
      apiKey = apiKey.replace(/[^\x20-\x7E]/g, '').trim().replace(/^["']|["']$/g, '');
    }

    // ⚠️ 前端表单不回填 Key（只显示脱敏），若用户没重填，
    //    这里必须沿用库里已有的 Key，否则一次"保存"就把 Key 清空了
    if (!apiKey) {
      const prev = db.prepare('SELECT api_key FROM ai_config LIMIT 1').get();
      if (prev && prev.api_key) {
        apiKey = prev.api_key;
      } else {
        return res.status(400).json({ error: '请填写 API Key（当前未配置）' });
      }
    }

    // 明文入库前加密（已是密文三段格式则跳过，避免二次加密）
    if (apiKey && apiKey.split(':').length !== 3) {
      apiKey = encryptApiKey(apiKey);
    }
    
    // Save to database
    db.prepare('DELETE FROM ai_config').run();
    db.prepare('INSERT INTO ai_config (provider, api_key, model) VALUES (?, ?, ?)').run(provider, apiKey, model);
    
    // Update runtime config
    setAiConfig({ provider, apiKey, model });
    
    res.json({ success: true, config: getAiConfig() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
