// 静默错误记录器
// 项目里有 80+ 处空 catch。全部改成 console.error 会刷屏，继续静默又会让
// 「表/列不存在」这类错误藏几百天（expense_logs 就是先例）。
// 折中：按 scope+message 去重计数，首次出现打一条 warn，之后只累加；
// 汇总通过 /api/system/metrics 的 system.silentErrors 暴露。
const counts = new Map();
const MAX_KEYS = 200;

export function silent(scope, err) {
  const message = (err && err.message) || String(err || 'unknown');
  const key = `${scope}|${message}`;
  const prev = counts.get(key) || 0;
  counts.set(key, prev + 1);
  if (prev === 0) console.warn(`[silent] ${scope}: ${message}`);
  if (counts.size > MAX_KEYS) {
    const oldest = counts.keys().next().value;
    if (oldest !== undefined) counts.delete(oldest);
  }
}

export function silentStats() {
  const entries = [...counts.entries()].map(([key, count]) => {
    const i = key.indexOf('|');
    return { scope: key.slice(0, i), message: key.slice(i + 1), count };
  }).sort((a, b) => b.count - a.count);
  return {
    total: entries.reduce((sum, e) => sum + e.count, 0),
    distinct: entries.length,
    top: entries.slice(0, 20),
  };
}
