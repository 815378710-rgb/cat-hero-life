// 猫猫侠工具箱 - 搜索 / 读文档 / 图片理解
// 联网搜索走 Bing RSS（境内可直连）。DuckDuckGo / Google 在境内不可达，已弃用。

// ===== 1. 网页搜索（Bing，无需 API Key） =====
const SEARCH_TTL = 5 * 60 * 1000;
const searchCache = new Map();
const SEARCH_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function decodeEntities(input) {
  return String(input == null ? '' : input)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ensp;/g, ' ')
    .replace(/&emsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#0*(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBingRss(xml, limit) {
  const out = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null && out.length < limit) {
    const block = m[1];
    const pick = (tag) => {
      const r = new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>', 'i').exec(block);
      return r ? decodeEntities(r[1]) : '';
    };
    const title = pick('title');
    const link = pick('link');
    if (title && link) out.push({ title, url: link, snippet: pick('description'), pubDate: pick('pubDate') });
  }
  return out;
}

function parseBingHtml(html, limit) {
  const out = [];
  const parts = String(html).split(/<li class="b_algo"/i).slice(1);
  for (const p of parts) {
    if (out.length >= limit) break;
    const a = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(p);
    if (!a) continue;
    const sn = /<p class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(p);
    out.push({
      title: decodeEntities(a[2]),
      url: a[1].replace(/&amp;/g, '&'),
      snippet: sn ? decodeEntities(sn[1]) : '',
      pubDate: ''
    });
  }
  return out;
}

// 口语化尾巴会让 Bing 严重跑偏（实测"西安今天天气怎么样"→ 返回科技特长生招生页），必须先洗掉
const QUERY_TAIL_NOISE = /(多少钱|多少元|多少个|多少|几点|几日|几个|几名|几注|怎么样啊|怎么样呢|怎么样|咋样|怎样|如何|是什么|是什么意思|是多少|有哪些|有什么|好不好|行不行|呢|吗|啊|呀|吧|嘛|哦|噢)\s*$/;
const QUERY_HEAD_NOISE = /^(搜索一下|搜索|搜一下|搜搜|查一下|查查|帮我查一下|帮我查|帮我找一下|帮我找|百度一下|百度|谷歌一下|谷歌|联网查一下|联网查|上网查一下|上网查|网上查一下|网上查|查询)\s*/;
// 口语虚词（任意位置），去掉它们往往能让分词回到正轨
const QUERY_FILLER = /(有什么|有没有|给我|帮我|看看|看一下|一下|说说|告诉我|了解一下|知道)/g;

export function cleanSearchQuery(raw) {
  const original = String(raw == null ? '' : raw).trim();
  let q = original.replace(QUERY_HEAD_NOISE, '').replace(QUERY_FILLER, ' ');
  let prev;
  let guard = 0;
  do {
    prev = q;
    q = q.replace(QUERY_TAIL_NOISE, '').replace(/[\s,，。.、!！?？~～]+$/, '');
    guard++;
  } while (q !== prev && guard < 6);
  q = q.replace(/\s+/g, ' ').trim();
  if (q.replace(/\s/g, '').length < 2) {
    q = original.replace(/[\s,，。.、!！?？~～]+$/, '').trim();
  }
  return q.slice(0, 40);
}

// 时效修饰词与疑问词：Bing 的中文分词遇上这些词极易跑偏
// （实测"赣锋锂业今天股价多少"→"赣"字百科；去掉后→东方财富/新浪财经）
const TRANSIENT_NOISE = /(最新|今天|今日|现在|目前|实时|当前|刚刚|此刻|今年|本年度|最近)/g;
const INTERROGATIVE = /(什么时候|什么时间|多少|几个|几名|几注|几日|几点|哪个|哪些|哪里|在哪|怎么|为何|为什么|是否|可不可以|可以吗|行吗)/g;

function coreQuery(q) {
  return String(q || '')
    .replace(TRANSIENT_NOISE, '')
    .replace(INTERROGATIVE, '')
    .replace(/的/g, '')
    .replace(/[\s,，。.、!！?？~～]+/g, ' ')
    .trim();
}

// 中文 2-gram，用来给"搜到的结果到底像不像我要找的"打分
function tokenize(q) {
  const s = String(q || '').replace(/\s+/g, '');
  const toks = new Set();
  for (let i = 0; i < s.length - 1; i++) toks.add(s.slice(i, i + 2));
  if (!toks.size && s) toks.add(s);
  return [...toks];
}

function scoreResults(results, ref) {
  const toks = tokenize(ref);
  let score = 0;
  for (const r of results) {
    const text = `${r.title || ''} ${r.snippet || ''}`;
    for (const t of toks) if (text.includes(t)) score++;
  }
  return score;
}

function fetchBing(q, mode, limit) {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(q)}${mode === 'rss' ? '&format=rss' : ''}&count=${limit}`;
  return fetch(url, {
    headers: { 'User-Agent': SEARCH_UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(9000)
  }).then(async (resp) => {
    if (!resp.ok) return [];
    const text = await resp.text();
    return /<(item|rss)[\s>]/i.test(text) ? parseBingRss(text, limit) : parseBingHtml(text, limit);
  });
}

/**
 * 联网搜索。返回 [{title, url, snippet, pubDate}] 或 null。
 *
 * 两层策略：
 *  1) 查询清洗 —— 口语尾巴（"怎么样"）和时效词（"最新"）会让 Bing 中文分词跑偏；
 *  2) 多变体择优 —— 同时用 [清洗后] 与 [去掉时效词] 搜索，再用 2-gram 命中率挑更像的那个。
 * 通道：RSS 优先（体积小），为空再退 HTML。
 *
 * @param {string} query 关键词
 * @param {number} limit 最多返回条数
 */
// ===== 1.5 正文抓取（关键增强）=====
// DeepSeek 网页版的联网之所以"聪明"，关键不在模型，而在检索层：
// 它会把搜到的网页正文读进来。而这里原来只拿到 Bing 的一句摘要，
// 模型看不到事实本身，只能靠摘要猜 —— 这就是差距的主要来源。

function stripHtml(html) {
  let s = String(html || '');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript|svg|iframe|template|form|nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ');
  // 优先取正文容器
  const box = s.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i);
  if (box && box[2]) s = box[2];
  else {
    const b = s.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (b && b[1]) s = b[1];
  }
  s = s.replace(/<(br|hr)\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li|h[1-6]|tr|section|blockquote)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;|&ensp;|&emsp;|&#160;/g, ' ')
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&apos;|&lsquo;|&rsquo;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#0*(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
  return s.replace(/[ \t\u00a0\u3000]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

async function fetchPageText(url, maxChars = 1800) {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': SEARCH_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(6000),
      redirect: 'follow',
    });
    if (!resp.ok) return '';
    const ct = String(resp.headers.get('content-type') || '');
    if (ct && !/html|text\/plain/i.test(ct)) return '';
    const html = (await resp.text()).slice(0, 400000);
    const text = stripHtml(html);
    if (text.length < 120) return '';
    return text.slice(0, maxChars);
  } catch (e) {
    return '';
  }
}

/** 给前 topN 条结果补上页面正文（带总预算，失败静默降级为摘要） */
async function enrichWithContent(results, topN = 3, budgetMs = 7000) {
  const targets = results.slice(0, topN).filter((r) => r.url && /^https?:\/\//i.test(r.url));
  if (!targets.length) return results;
  const t0 = Date.now();
  const jobs = targets.map((r) => fetchPageText(r.url, 1800).then((t) => {
    if (t) r.content = t;
    return t;
  }).catch(() => ''));
  await Promise.race([
    Promise.all(jobs),
    new Promise((res) => setTimeout(res, budgetMs)),
  ]);
  const got = targets.filter((r) => r.content).length;
  console.log(`[webSearch] 正文抓取 ${got}/${targets.length} 条，用时 ${Date.now() - t0}ms`);
  return results;
}

export async function webSearch(query, limit = 6) {
  const raw = String(query || '').trim();
  if (!raw) return null;

  const cleaned = cleanSearchQuery(raw);
  const core = coreQuery(cleaned);
  const variants = [...new Set([cleaned, core])].filter((v) => v && v.length >= 2);

  const key = cleaned.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.time < SEARCH_TTL) return cached.results;

  const settled = await Promise.all(variants.map(async (v) => {
    try {
      let r = await fetchBing(v, 'rss', limit);
      if (!r.length) r = await fetchBing(v, 'html', limit);
      return { v, r };
    } catch (e) {
      console.error('[webSearch] 变体失败(' + v + '): ' + e.message);
      return { v, r: [] };
    }
  }));

  const ref = core || cleaned;
  let best = [];
  let bestScore = -1;
  for (const { v, r } of settled) {
    if (!r.length) continue;
    const sc = scoreResults(r, ref);
    console.log('[webSearch] "' + v + '" → ' + r.length + ' 条, 命中分 ' + sc);
    if (sc > bestScore) { bestScore = sc; best = r; }
  }
  if (!best.length) return null;

  // 把前几条的网页正文读进来（这是"搜得好"与"只是搜到"的分水岭）
  try { await enrichWithContent(best, 3, 7000); } catch (e) { console.error('[webSearch] 正文增强失败:', e.message); }

  searchCache.set(key, { time: Date.now(), results: best });
  if (searchCache.size > 200) {
    for (const [k, v] of searchCache) if (Date.now() - v.time > SEARCH_TTL) searchCache.delete(k);
  }
  return best;
}

// ===== 2. 文档读取（TXT/MD直接读，PDF/DOCX解析） =====
export async function readDocument(fileBuffer, filename, mimeType) {
  const ext = (filename || '').split('.').pop()?.toLowerCase();

  try {
    // 纯文本
    if (['txt', 'md', 'json', 'csv', 'js', 'py', 'html', 'css', 'yaml', 'yml'].includes(ext)) {
      return { text: fileBuffer.toString('utf-8').slice(0, 50000), type: ext };
    }

    // PDF 简单解析（提取可见文本）
    if (ext === 'pdf') {
      const text = extractPdfText(fileBuffer);
      return { text: text.slice(0, 50000), type: 'pdf' };
    }

    // DOCX 简单解析
    if (ext === 'docx') {
      const text = extractDocxText(fileBuffer);
      return { text: text.slice(0, 50000), type: 'docx' };
    }

    // 其他类型当文本试试
    return { text: fileBuffer.toString('utf-8').slice(0, 50000), type: ext || 'unknown' };
  } catch (e) {
    return { text: `读取失败: ${e.message}`, type: 'error' };
  }
}

function extractPdfText(buffer) {
  // 简单PDF文本提取：找 stream 和 BT...ET 块
  const str = buffer.toString('latin1');
  let text = '';
  const streamRegex = /(\/Text|stream[\s\S]*?endstream)/g;
  let match;
  while ((match = streamRegex.exec(str)) !== null) {
    const chunk = match[0];
    // 提取括号内的文本 BT ... ET
    const btRegex = /BT[\s\S]*?ET/g;
    let btMatch;
    while ((btMatch = btRegex.exec(chunk)) !== null) {
      const btContent = btMatch[0];
      const textRegex = /\(([^)]*)\)/g;
      let tMatch;
      while ((tMatch = textRegex.exec(btContent)) !== null) {
        if (tMatch[1] && !/^[\\\/\{\}]/.test(tMatch[1])) {
          text += tMatch[1] + ' ';
        }
      }
    }
  }
  return text.trim() || '无法提取PDF文本，请转换为TXT后重试';
}

function extractDocxText(buffer) {
  // DOCX 是 ZIP 包，提取 word/document.xml
  try {
    const { findInZip } = require('../utils/zip-reader');
    const xml = findInZip(buffer, 'word/document.xml');
    if (!xml) return '无法读取DOCX内容';
    // 简单XML去标签
    return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50000);
  } catch (e) {
    return 'DOCX解析失败，请转换为TXT后重试';
  }
}

// ===== 3. 图片理解（deepseek-v4-pro vision） =====
export function buildImageMessage(text, imageBase64, mimeType = 'image/jpeg') {
  return {
    role: 'user',
    content: [
      { type: 'text', text: text || '请描述这张图片的内容' },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
    ]
  };
}

// ===== 4. 意图检测：是否需要搜索/读文档/看图片 =====
export function detectToolIntent(message) {
  const lower = message.toLowerCase();

  // 搜索意图
  if (/搜索|查一下|搜一下|帮我找|最新的|新闻|是什么|怎么回事|百科/i.test(message) ||
      /search|look.?up|find|what is|how to/i.test(lower)) {
    const searchQuery = message.replace(/^(搜索|查一下|搜一下|帮我找|帮我查)/, '').trim();
    return { tool: 'search', query: searchQuery || message };
  }

  // 图片分析意图
  if (/这张图|看图|图片|照片|截图|分析.*图|识别.*图|图上|图中|这是什么图/i.test(message)) {
    return { tool: 'vision', query: message };
  }

  return null;
}

// ===== 5. 联网搜索触发判定 =====
// 强时效性词才触发，避免把"我最近很累"这种本地吐槽也送去搜
const SEARCH_HINT = /搜索|搜一下|搜搜|查一下|查查|帮我查|帮我找|百度|谷歌|联网|上网查|网上查|网络查|最新消息|最新进展|新闻|实时|今日|行情|价格|多少钱|报价|走势|排名|排行榜|热搜|天气/;

export function shouldSearch(message, force) {
  if (force === true) return true;
  if (force === false) return false;
  const text = String(message || '').trim();
  if (!text) return false;
  return SEARCH_HINT.test(text);
}

// 把搜索结果整理成注入 system prompt 的参考资料
export function buildSearchContext(results, query) {
  if (!Array.isArray(results) || results.length === 0) return '';
  const now = new Date(Date.now() + 8 * 3600000).toISOString().replace('T', ' ').slice(0, 16);
  const withBody = results.filter((r) => r.content).length;
  const lines = results.map((r, i) => {
    const date = r.pubDate ? `（${r.pubDate}）` : '';
    // 有正文就用正文（信息量远大于摘要），没有才退回摘要
    const body = r.content ? `正文：${r.content}` : `摘要：${r.snippet}`;
    return `[${i + 1}] ${r.title}${date}\n    ${body}\n    来源: ${r.url}`;
  });
  return `\n\n【实时联网搜索结果】\n搜索词："${query}"  搜索时间：${now}（北京时间）\n` +
    `（其中 ${withBody} 条已抓取到网页正文，其余只有摘要）\n${lines.join('\n')}\n\n` +
    `【联网回答要求】上方是刚刚联网查到的真实资料，请优先依据它回答，不要凭记忆编造；` +
    `标了"正文"的来源信息更完整，可优先采信；数字、日期、价格这类事实必须以资料为准。` +
    `回答时自然地说明是刚查到的（例如"我刚搜了一下"），需要时在句末附上来源编号如 [1]。` +
    `若资料不足以回答，就如实说没查到，不要硬编。`;
}
