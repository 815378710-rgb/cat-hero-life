// 猫猫侠 - 文生图服务
// 引擎：Pollinations（Sana 模型），免费、无需 Key、境内可直连
// 注意：匿名额度有限，会随机返回 402，所以必须靠"重试"兜底；
//      加 referrer 能显著提升成功率，model / seed 等额外参数反而会触发 402，别传。

const BASE = 'https://image.pollinations.ai/prompt/';
const REFERRER = 'life.maomaoxia.top';
const SIZES = { square: [768, 768], wide: [1024, 576], tall: [576, 1024] };
const MAX_ATTEMPTS = 4;
const RETRY_DELAY = 2500;

// ===== 意图识别 =====
const DRAW_HINT = /(^画|^绘制|画一[张幅个只条]|画张|画个|帮我画|给我画|生成一[张幅个]|生成图|生成图片|来一[张幅]图|来张图|发一[张幅]图|发张图|发个图|给我发图|给我来张图|做一[张幅]图|做个图|配一张图|配个图|画一张)/;

const DRAW_STRIP = /^(帮我|给我|请|麻烦|你|能不能|可以)?\s*(画一[张幅个只条]|画张|画个|画一下|画|绘制一[张幅个]?|绘制|生成一[张幅个]|生成图|生成图片|生成|来一[张幅]图|来张图|来张|来一[张幅]|来|发一[张幅]图|发张图|发个图|发一张|发|做一[张幅]图|做个图|做张|做|配一张图|配个图|配图)\s*(一)?\s*(张|幅|个)?\s*(图|图片|画|插画|照片|海报|头像|表情包)?[，,：:、 ]*/;

export function isDrawIntent(message) {
  return DRAW_HINT.test(String(message || '').trim());
}

/** 从"帮我画一张穿着宇航服的猫猫侠"里抽出"穿着宇航服的猫猫侠" */
export function extractDrawPrompt(message) {
  let s = String(message || '').trim();
  s = s.replace(DRAW_STRIP, '').trim();
  s = s.replace(/^(内容|画面|主题)?[是为：:，,、\s]+/, '').trim();
  s = s.replace(/^(的|一张|一幅|只)\s*/, '').trim();
  s = s.replace(/[。.!！~～]+$/, '').trim();
  return s;
}

function buildUrl(prompt, size) {
  const [w, h] = SIZES[size] || SIZES.square;
  return `${BASE}${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&referrer=${encodeURIComponent(REFERRER)}`;
}

async function attemptFetch(url, timeoutMs) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!resp.ok) return { ok: false, status: 'HTTP ' + resp.status };
  const buf = Buffer.from(await resp.arrayBuffer());
  // 402/500 时也会返回 200 之外的小体积内容，双保险
  if (buf.length < 2000) return { ok: false, status: 'too-small(' + buf.length + ')' };
  return { ok: true, buf, type: resp.headers.get('content-type') || 'image/jpeg' };
}

/**
 * 生成图片。
 * @returns {Promise<null|{ok:boolean,url:string,prompt:string,attempt?:number,dataUrl?:string,error?:string}>}
 */
export async function generateImage(prompt, opts = {}) {
  const p = String(prompt || '').trim();
  if (!p) return null;

  const size = opts.size || 'square';
  const timeout = opts.timeout || 60000;
  const url = buildUrl(p, size);
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const r = await attemptFetch(url, timeout);
      if (r.ok) {
        console.log(`[image-gen] "${p}" 第 ${attempt} 次成功, ${r.buf.length}B`);
        return {
          ok: true,
          url,
          prompt: p,
          attempt,
          bytes: r.buf.length,
          dataUrl: `data:${r.type};base64,${r.buf.toString('base64')}`
        };
      }
      lastError = r.status;
      console.warn(`[image-gen] "${p}" 第 ${attempt} 次失败: ${r.status}`);
    } catch (e) {
      lastError = e.message;
      console.warn(`[image-gen] "${p}" 第 ${attempt} 次异常: ${e.message}`);
    }
    if (attempt < MAX_ATTEMPTS) await new Promise((res) => setTimeout(res, RETRY_DELAY));
  }

  return { ok: false, url, prompt: p, error: lastError };
}

export function buildDrawSuccessNote(prompt) {
  return `\n\n[系统提示] 用户让你画图，内容："${prompt}"。图片已经生成并直接展示在聊天界面里了。` +
    `请用猫猫侠的口吻配一两句简短的话（别超过 40 字），像是"画好啦，你看～"这种，不要描述图片细节，不要重复用户的原话，也不要说"我无法生成图片"。`;
}

export function buildDrawFailNote(prompt, reason) {
  return `\n\n[系统提示] 用户让你画图，内容："${prompt}"，但画图服务暂时不可用（${reason || '未知原因'}）。` +
    `请如实告诉他这次没画出来、可以稍后再试，绝对不要假装已经画好了，也不要输出任何图片链接。`;
}
