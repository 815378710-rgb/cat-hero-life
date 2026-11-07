// 外部数据感知服务 — 天气、基金行情主动拉取
// 每30分钟拉一次，数据写入 llm_session_state.last_topics 供 AI 使用
import { getDb } from '../db/init.js';

// ===== 数据源配置 =====
const CONFIG = {
  // 用户所在城市（从 life_profile 动态读取，fallback 西安）
  cityMap: { '西安': { lat: '34.26', lon: '108.94', code: '101110101' } },
  // 基金代码
  fundCodes: [],  // 动态从数据库读取
  // wttr.in 免费天气API（无需key）
  weatherUrl: (city) => `https://wttr.in/${city}?format=j1`,
  // 拉取间隔
  pollIntervalMs: 30 * 60_000,
};

let pollTimer = null;
let latestData = { weather: null, funds: null, updatedAt: null };

// ===== 数据拉取 =====

async function fetchWeather(city) {
  try {
    const url = CONFIG.weatherUrl(encodeURIComponent(city));
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    
    const current = data.current_condition?.[0];
    const forecast = data.weather?.[0];
    
    if (!current) return null;

    return {
      city,
      temp: current.temp_C + '°C',
      feelsLike: current.FeelsLikeC + '°C',
      humidity: current.humidity + '%',
      condition: current.weatherDesc?.[0]?.value || current.lang_zh?.[0]?.value || '未知',
      wind: current.winddir16Point + ' ' + current.windspeedKmph + 'km/h',
      high: forecast?.maxtempC + '°C',
      low: forecast?.mintempC + '°C',
      updatedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error('Weather fetch error:', e.message);
    return null;
  }
}

// ===== 基金行情（使用 akshare 风格的公开 API）=====
async function fetchFundData(fundCodes) {
  if (!fundCodes || fundCodes.length === 0) return null;
  
  try {
    // 使用天天基金公开 JSONP 接口
    const codes = fundCodes.join(',');
    const url = `https://fundgz.1234567.com.cn/js/${codes}.js`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    
    const text = await resp.text();
    // 解析 jsonpgz(...) 格式
    const jsonStr = text.replace(/^jsonpgz\(/, '').replace(/\);?$/, '');
    const data = JSON.parse(jsonStr);
    
    // 可能返回单个或数组
    const funds = Array.isArray(data) ? data : [data];
    
    return funds.map(f => ({
      code: f.fundcode,
      name: f.name,
      nav: f.dwjz,           // 单位净值
      estimatedNav: f.gsz,   // 估算净值
      estimatedChange: f.gszzl + '%',  // 估算涨跌幅
      updateTime: f.jzrq,
    }));
  } catch (e) {
    console.error('Fund fetch error:', e.message);
    return null;
  }
}

// ===== 定时轮询 =====

export async function pollExternalData() {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (!user) return;

    // 获取用户城市
    const profile = db.prepare('SELECT city FROM life_profile WHERE user_id = ?').get(user.id);
    const city = profile?.city || '西安';

    // 获取用户关注的基金
    let fundCodes = [];
    try {
      const funds = db.prepare(
        "SELECT fund_code FROM user_funds WHERE user_id = ? AND is_active = 1"
      ).all(user.id);
      fundCodes = funds.map(f => f.fund_code);
    } catch {
      // user_funds 表可能不存在
    }

    // 并行拉取
    const [weather, funds] = await Promise.all([
      fetchWeather(city),
      fundCodes.length > 0 ? fetchFundData(fundCodes) : Promise.resolve(null),
    ]);

    if (weather || funds) {
      latestData = {
        weather,
        funds,
        updatedAt: new Date().toISOString(),
      };

      // 将数据摘要写入会话状态，供 AI 使用
      let summary = '外部数据更新: ';
      if (weather) {
        summary += `${weather.city}天气${weather.temp} ${weather.condition}, `;
      }
      if (funds) {
        const fundSummary = funds.map(f => `${f.name}(${f.estimatedChange})`).join(', ');
        summary += `基金: ${fundSummary}`;
      }
      
      try {
        const row = db.prepare('SELECT last_topics FROM llm_session_state WHERE user_id = ?').get(user.id);
        if (row) {
          // ⚠️ 历史上这里用 last_topics || ' | ' || ? 无限追加，从不清理，
          //    3 个月把该字段撑到 11 万字符；它会被整段拼进 system prompt，
          //    导致每次 AI 调用都发送超长上下文（慢且贵）。这里只保留最近 3 条。
          const parts = String(row.last_topics || '').split(' | ').filter(Boolean);
          parts.push(summary);
          const trimmed = parts.slice(-3).join(' | ').slice(-1000);
          db.prepare(
            "UPDATE llm_session_state SET last_topics = ?, updated_at = datetime('now') WHERE user_id = ?"
          ).run(trimmed, user.id);
        }
      } catch {}

      console.log('External data updated:', summary.slice(0, 100));
    }
  } catch (e) {
    console.error('External data poll error:', e.message);
  }
}

// ===== 启动/停止 =====

export function startExternalDataPolling() {
  if (pollTimer) return;
  
  // 启动后立即拉一次
  pollExternalData();
  
  pollTimer = setInterval(pollExternalData, CONFIG.pollIntervalMs);
  console.log('External data polling started (every 30min)');
}

export function stopExternalDataPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ===== 查询接口 =====

export function getLatestExternalData() {
  return latestData;
}

export function getWeatherSummary() {
  const w = latestData.weather;
  if (!w) return null;
  return `${w.city}: ${w.temp} ${w.condition}（高${w.high}/低${w.low}）`;
}

export function getFundSummary() {
  const funds = latestData.funds;
  if (!funds || funds.length === 0) return null;
  return funds.map(f => `${f.name}: ${f.estimatedChange}`).join(', ');
}
