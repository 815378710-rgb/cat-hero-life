// 多模态处理服务 — 图片接收/处理/LLM视觉调用
import { chatWithLLM, isAiEnabled, getRawApiKey, DEFAULT_MODEL, MIN_MAX_TOKENS } from './ai-engine.js';
import { getDb } from '../db/init.js';
import { v4 as uid } from 'uuid';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const UPLOAD_DIR = join(process.cwd(), 'data', 'uploads');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const CHAT_URL = 'https://api.deepseek.com/v1/chat/completions';

// ===== 图片处理 =====

// 将 base64 图片保存到本地并返回路径
export function saveBase64Image(base64Data) {
  const id = uid();
  const ext = detectImageFormat(base64Data) || 'jpg';
  const filename = `${id}.${ext}`;
  const filepath = join(UPLOAD_DIR, filename);

  // 去掉 data:image/xxx;base64, 前缀
  const cleanData = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(cleanData, 'base64');

  writeFileSync(filepath, buffer);

  return { id, filename, filepath, size: buffer.length };
}

function detectImageFormat(base64) {
  const s = base64.replace(/^data:image\/\w+;base64,/, '');
  if (s.startsWith('/9j/')) return 'jpg';
  if (s.startsWith('iVBOR')) return 'png';
  if (s.startsWith('R0lGOD')) return 'gif';
  if (s.startsWith('UklGR')) return 'webp';
  return null;
}

// 将图片文件转为 base64（用于 API 调用）
export function imageToBase64(filepath) {
  if (!existsSync(filepath)) return null;
  const buffer = readFileSync(filepath);
  const ext = filepath.split('.').pop()?.toLowerCase() || 'jpg';
  const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

// ===== LLM 视觉调用 =====

async function postChat(apiKey, body, timeoutMs = 60000) {
  return fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
}

/**
 * 视觉识别请求体。
 *
 * ⚠️ 必须显式关闭推理（reasoning_effort: 'none'）。
 * 2026-10-05 实测：deepseek-flash 处理图片时会触发极长推理链
 * （单张彩票图 reasoning 达 12609 字符 ≈ 4096 token），会把 max_tokens 预算全部烧光，
 * 返回 finish_reason='length' 且 content 为空字符串 → 调用方解析失败、静默无结果。
 * 关闭推理后同一张图 1.2s 返回完整 JSON，且不会像加大预算那样产生多余幻觉注数。
 */
function buildVisionBody(imageBase64, prompt, maxTokens) {
  return {
    model: DEFAULT_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageBase64 } },
          { type: 'text', text: prompt }
        ]
      }
    ],
    max_tokens: maxTokens,
    temperature: 0.3,
    reasoning_effort: 'none'
  };
}

export async function analyzeImage(imageBase64, prompt = '请描述这张图片的内容') {
  if (!isAiEnabled()) return { error: 'AI 未启用' };

  try {
    const apiKey = getRawApiKey();
    if (!apiKey) return { error: 'API Key 未配置' };

    const call = async (maxTokens) => {
      const response = await postChat(apiKey, buildVisionBody(imageBase64, prompt, maxTokens));
      if (!response.ok) {
        const err = await response.text();
        // 如果多模态不被支持，降级为纯文本描述
        if (response.status === 400 && (err.includes('image') || err.includes('vision') || err.includes('multimodal'))) {
          return {
            text: '（视觉模型暂不可用）已收到图片，但我暂时无法分析图片内容。',
            _fallback: true, _error: err.slice(0, 100)
          };
        }
        return { error: `API 错误 ${response.status}: ${err.slice(0, 100)}` };
      }
      const data = await response.json();
      const choice = data.choices?.[0];
      const text = choice?.message?.content || '';
      if (!text) {
        console.warn(
          `analyzeImage: 空内容 (finish=${choice?.finish_reason}, max_tokens=${maxTokens}, ` +
          `reasoning_tokens=${data.usage?.completion_tokens_details?.reasoning_tokens ?? '?'})`
        );
      }
      return { text, _raw: data, _finish: choice?.finish_reason };
    };

    let out = await call(MIN_MAX_TOKENS);
    // 兜底：若仍因长度截断返回空，翻倍预算重试一次
    if (!out.error && !out.text && out._finish === 'length') {
      console.warn('analyzeImage: 触发空内容重试（预算翻倍）');
      out = await call(Math.max(MIN_MAX_TOKENS * 2, 8192));
    }
    return out;
  } catch (e) {
    console.error('analyzeImage:', e.message);
    return { error: e.message };
  }
}

// ===== 多模态对话（图文混合）=====
export async function chatWithImage(userMessage, imageBase64, conversationHistory = [], userId = null) {
  if (!isAiEnabled()) return { text: 'AI 未启用' };

  try {
    const apiKey = getRawApiKey();
    if (!apiKey) return { text: 'API Key 未配置' };

    // 构建多模态消息
    const messages = [...conversationHistory.slice(-5)];

    // 用户消息：图文混合
    const userContent = [
      { type: 'image_url', image_url: { url: imageBase64 } },
      { type: 'text', text: userMessage || '请看看这张图片' }
    ];

    messages.push({ role: 'user', content: userContent });

    const body = {
      model: DEFAULT_MODEL,
      messages,
      max_tokens: MIN_MAX_TOKENS,
      temperature: 0.7,
      reasoning_effort: 'high'
    };

    let response = await postChat(apiKey, body);
    if (!response.ok) {
      return { text: '（AI视觉服务暂不可用）' };
    }

    let data = await response.json();
    let text = data.choices?.[0]?.message?.content || '';

    // 兜底：推理吃光 token 会导致 content 为空，此时关闭推理重试一次
    if (!text) {
      console.warn('chatWithImage: 空内容，关闭推理重试');
      const r2 = await postChat(apiKey, { ...body, reasoning_effort: 'none' });
      if (r2.ok) {
        data = await r2.json();
        text = data.choices?.[0]?.message?.content || '';
      }
    }

    // 记录到聊天历史
    if (userId) {
      try {
        const db = getDb();
        db.prepare("INSERT INTO chat_history (user_id, role, content, metadata) VALUES (?, 'user', ?, ?)")
          .run(userId, `[图片] ${userMessage}`, JSON.stringify({ type: 'image', size: imageBase64.length }));
        db.prepare("INSERT INTO chat_history (user_id, role, content, metadata) VALUES (?, 'assistant', ?, ?)")
          .run(userId, text, JSON.stringify({ source: 'vision' }));
      } catch {}
    }

    return { text };
  } catch (e) {
    console.error('chatWithImage:', e.message);
    return { text: '处理图片时出错' };
  }
}

// ===== 清理过期上传文件（>24h）=====
// 修复（2026-10-05）：原实现用 require('fs')，在 ESM 模块里必然抛异常，
// 被 catch 吞掉后「清理」从未真正执行，uploads 目录无限增长。
export function cleanupUploads() {
  try {
    const files = readdirSync(UPLOAD_DIR);
    const now = Date.now();
    let removed = 0;
    for (const file of files) {
      const filepath = join(UPLOAD_DIR, file);
      try {
        const stat = statSync(filepath);
        if (!stat.isFile()) continue;
        if (now - stat.mtimeMs > 24 * 3600_000) {
          unlinkSync(filepath);
          removed += 1;
        }
      } catch {}
    }
    if (removed) console.log(`cleanupUploads: 已清理 ${removed} 个过期上传文件`);
    return removed;
  } catch (e) {
    console.error('cleanupUploads:', e.message);
    return 0;
  }
}
