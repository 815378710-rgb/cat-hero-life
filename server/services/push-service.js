// 猫猫侠 服务端推送通道（替代微信桌面端 UIA / Wechaty）
// ============================================================
// 设计目标：把猫猫侠的主动通知直接推到用户微信，且不在用户电脑上跑任何
// GUI 自动化（UIA 曾导致用户机器卡死），物理上不可能再崩机。
//
// 支持的通道（均为"服务端直推"，消息进用户微信的『服务通知』）：
//   - serverchan : Server酱  https://sctapi.ftqq.com/{SENDKEY}.send
//   - pushplus   : 推送加    https://www.pushplus.plus/send
//   - wecom      : 企业微信机器人 webhook（进企业微信，非个人微信服务通知）
//
// 配置优先级：环境变量 > push.json（位于 server/config/push.json）
//   WX_PUSH_PROVIDER  serverchan | pushplus | wecom
//   WX_PUSH_TOKEN     Server酱 SENDKEY / pushplus token / 企业微信 key
//   WX_PUSH_URL       可选，覆盖默认接口地址（如自建反代）
//
// 失败安全：任何异常只记日志并返回 {success:false}，绝不影响主流程。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'push.json');

let _cfg = null;

function loadConfig() {
  const cfg = {
    provider: process.env.WX_PUSH_PROVIDER || '',
    token: process.env.WX_PUSH_TOKEN || '',
    baseUrl: process.env.WX_PUSH_URL || '',
  };
  // 环境变量未配置时，回退到 push.json 文件（便于不改 docker env 直接部署）
  if (!cfg.provider || !cfg.token) {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const f = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        cfg.provider = cfg.provider || String(f.provider || '').trim();
        cfg.token = cfg.token || String(f.token || '').trim();
        cfg.baseUrl = cfg.baseUrl || String(f.baseUrl || '').trim();
      }
    } catch (e) {
      console.error('[push] 读取 push.json 失败:', e.message);
    }
  }
  return cfg;
}

export function getPushConfig() {
  if (!_cfg) _cfg = loadConfig();
  return _cfg;
}

// 改了 push.json 后热重载（无需重启容器）
export function reloadPushConfig() {
  _cfg = loadConfig();
  return _cfg;
}

export function pushStatus() {
  const c = getPushConfig();
  return {
    provider: c.provider || '未配置',
    configured: !!(c.provider && c.token),
    baseUrl: c.baseUrl || '',
  };
}

// 统一 POST JSON
async function postJson(url, body, timeoutMs = 10000) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: r.status, text: await r.text() };
}

// 统一 POST 表单（application/x-www-form-urlencoded）
async function postForm(url, params, timeoutMs = 10000) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: r.status, text: await r.text() };
}

/**
 * 推送一条消息到用户微信。
 * @param {string} title   标题（建议短）
 * @param {string} content 正文
 * @returns {Promise<{success:boolean, message:string}>}
 */
export async function pushToWeChat(title, content) {
  const c = getPushConfig();
  if (!c.provider || !c.token) {
    console.warn('[push] 未配置推送通道，跳过推送（请在 push.json 或环境变量配置 WX_PUSH_*）');
    return { success: false, message: '未配置推送通道' };
  }
  const t = (title || '猫猫侠').slice(0, 80);
  const body = (content || '').slice(0, 40000);
  try {
    if (c.provider === 'serverchan') {
      const url = c.baseUrl || `https://sctapi.ftqq.com/${c.token}.send`;
      const r = await postForm(url, { title: t, desp: body });
      console.log(`[push] Server酱 -> ${r.status} ${r.text.slice(0, 120)}`);
      return { success: r.status === 200, message: r.text.slice(0, 200) };
    }
    if (c.provider === 'pushplus') {
      const url = c.baseUrl || 'https://www.pushplus.plus/send';
      const r = await postJson(url, { token: c.token, title: t, content: body, template: 'txt' });
      console.log(`[push] 推送加 -> ${r.status} ${r.text.slice(0, 120)}`);
      return { success: r.status === 200, message: r.text.slice(0, 200) };
    }
    if (c.provider === 'wecom') {
      const url = c.baseUrl || `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${c.token}`;
      const r = await postJson(url, { msgtype: 'text', text: { content: `${t}\n${body}` } });
      console.log(`[push] 企业微信 -> ${r.status} ${r.text.slice(0, 120)}`);
      return { success: r.status === 200, message: r.text.slice(0, 200) };
    }
    console.error('[push] 未知 provider:', c.provider);
    return { success: false, message: `未知 provider: ${c.provider}` };
  } catch (e) {
    console.error('[push] 发送异常:', e.message);
    return { success: false, message: e.message };
  }
}
