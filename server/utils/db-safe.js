// sql.js 参数安全化工具
// sql.js 不接受 undefined，需要转成 null

export function safe(val) {
  return val === undefined ? null : val;
}

export function safeObj(obj) {
  if (obj === undefined || obj === null) return null;
  if (typeof obj === 'object') return JSON.stringify(obj);
  return obj;
}
