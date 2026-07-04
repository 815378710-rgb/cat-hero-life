// 时区工具函数 - 统一使用Asia/Shanghai时区
export function getToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

export function getNow() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T');
}

export function getHour() {
  return parseInt(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai', hour: 'numeric', hour12: false }));
}

export function getDayOfWeek() {
  return new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short' }).toLowerCase();
}
