// 猫猫侠 · 彩票服务
// 玩法规则：
//   超级大乐透（dlt）：前区 5/35 + 后区 2/12，2026-02-02 第26014期起新规，7 个奖级
//   双色球（ssq）  ：红球 6/33 + 蓝球 1/16，6 个奖级
// 开奖数据源：体彩 / 福彩官方接口（见 fetch* 函数）
//
// 设计要点：**固定奖单注奖金不自己算，直接取官方公告的单注金额**
// 因为大乐透三至七等奖会随奖池是否≥8亿浮动（5000/6666 等），自己分档极易错。

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ===== 玩法定义 =====

export const GAMES = {
  dlt: {
    key: 'dlt',
    name: '超级大乐透',
    short: '大乐透',
    icon: '🔴',
    main: { count: 5, max: 35, label: '前区' },
    extra: { count: 2, max: 12, label: '后区' },
    basePrice: 2,
    appendPrice: 1,
    levels: 7,
    drawDays: [1, 3, 6], // 周一 / 周三 / 周六
    drawTime: '21:30',
  },
  ssq: {
    key: 'ssq',
    name: '双色球',
    short: '双色球',
    icon: '🔵',
    main: { count: 6, max: 33, label: '红球' },
    extra: { count: 1, max: 16, label: '蓝球' },
    basePrice: 2,
    appendPrice: 0,
    levels: 6,
    drawDays: [0, 2, 4], // 周日 / 周二 / 周四
    drawTime: '21:15',
  },
};

const LEVEL_NAMES = ['', '一等奖', '二等奖', '三等奖', '四等奖', '五等奖', '六等奖', '七等奖'];

// 兜底奖金表（官方公告缺数据时才用；仅固定奖）
// 大乐透：[奖池<8亿, 奖池≥8亿]（2026 新规）
const DLT_FALLBACK = { 3: [5000, 6666], 4: [300, 380], 5: [150, 200], 6: [15, 18], 7: [5, 7] };
const SSQ_FALLBACK = { 3: 3000, 4: 200, 5: 10, 6: 5 };

// ===== 小工具 =====

export function beijingDate(d = new Date()) {
  return new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

function beijingNow(d = new Date()) {
  return new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
}

function num(v) {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function normalizeNumbers(game, raw) {
  const g = GAMES[game];
  if (!g || !raw) return null;
  const main = (raw.main || raw.front || raw.red || []).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  const extra = (raw.extra || raw.back || raw.blue || []).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  if (main.length !== g.main.count || extra.length !== g.extra.count) return null;
  if (main.some((n) => n > g.main.max) || extra.some((n) => n > g.extra.max)) return null;
  return { main, extra };
}

function sameSet(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ===== 开奖数据抓取 =====

/** 大乐透官方接口（需 Referer） */
async function fetchDltDraws(limit = 30) {
  const url = `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=85&provinceId=0&pageSize=${limit}&isVerify=1&pageNo=1`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://static.sporttery.cn/', Accept: 'application/json, text/plain, */*' },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`大乐透接口 HTTP ${resp.status}`);
  const json = await resp.json();
  const list = json?.value?.list || [];

  return list.map((it) => {
    const nums = String(it.lotteryDrawResult || '').trim().split(/\s+/).map(Number);
    const levels = (it.prizeLevelList || []).map((p) => ({
      name: String(p.prizeLevel || '').trim(),
      amount: num(p.stakeAmount),
      count: num(p.stakeCount),
    })).filter((p) => p.name);
    return {
      game: 'dlt',
      issue: String(it.lotteryDrawNum || ''),
      draw_date: String(it.lotteryDrawTime || '').slice(0, 10),
      numbers: { main: nums.slice(0, 5), extra: nums.slice(5, 7) },
      prize_levels: levels,
      pool: String(it.poolBalanceAfterdraw || ''),
      sales: String(it.totalSaleAmount || ''),
    };
  }).filter((d) => d.issue && d.numbers.main.length === 5);
}

/** 双色球官方接口（需 Referer） */
async function fetchSsqDraws(limit = 30) {
  const url = `https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=${limit}&pageNo=1&pageSize=${limit}&systemType=PC`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://www.cwl.gov.cn/', Accept: 'application/json, text/plain, */*' },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`双色球接口 HTTP ${resp.status}`);
  const json = await resp.json();
  const list = json?.result || [];

  return list.map((it) => {
    const red = String(it.red || '').split(',').map(Number).filter(Boolean);
    const blue = String(it.blue || '').split(',').map(Number).filter(Boolean);
    const levels = (it.prizegrades || []).map((p) => ({
      name: LEVEL_NAMES[Number(p.type) || 0] || `奖项${p.type}`,
      amount: num(p.typemoney),
      count: num(p.typenum),
    })).filter((p) => p.name);
    return {
      game: 'ssq',
      issue: String(it.code || ''),
      draw_date: String(it.date || '').slice(0, 10),
      numbers: { main: red, extra: blue },
      prize_levels: levels,
      pool: String(it.poolmoney || ''),
      sales: String(it.sales || ''),
    };
  }).filter((d) => d.issue && d.numbers.main.length === 6);
}

/** 抓取并落库，返回 { game, saved, latest } */
export async function syncDraws(db, game, limit = 30) {
  const g = GAMES[game];
  if (!g) throw new Error('未知玩法: ' + game);
  const list = game === 'dlt' ? await fetchDltDraws(limit) : await fetchSsqDraws(limit);
  const now = beijingNow();
  const stmt = db.prepare(`
    INSERT INTO lottery_draws (game, issue, draw_date, numbers, prize_levels, pool, sales, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(game, issue) DO UPDATE SET
      draw_date = excluded.draw_date,
      numbers = excluded.numbers,
      prize_levels = excluded.prize_levels,
      pool = excluded.pool,
      sales = excluded.sales,
      updated_at = excluded.updated_at
  `);
  let saved = 0;
  for (const d of list) {
    stmt.run(d.game, d.issue, d.draw_date, JSON.stringify(d.numbers), JSON.stringify(d.prize_levels), d.pool, d.sales, now);
    saved++;
  }
  return { game, saved, latest: list[0] || null };
}

/** 同步两种玩法（失败互不影响） */
export async function syncAllDraws(db, limit = 30) {
  const out = [];
  for (const game of ['dlt', 'ssq']) {
    try {
      out.push(await syncDraws(db, game, limit));
    } catch (e) {
      out.push({ game, error: e.message, saved: 0 });
    }
  }
  return out;
}

export function getDraw(db, game, issue) {
  if (!issue) return null;
  const row = db.prepare('SELECT * FROM lottery_draws WHERE game = ? AND issue = ?').get(game, String(issue));
  if (!row) return null;
  return {
    ...row,
    numbers: JSON.parse(row.numbers || '{}'),
    prize_levels: JSON.parse(row.prize_levels || '[]'),
  };
}

/** 下一期（用于录入默认值） */
export function nextIssue(db, game) {
  const g = GAMES[game];
  const last = db.prepare('SELECT issue, draw_date FROM lottery_draws WHERE game = ? ORDER BY issue DESC LIMIT 1').get(game);
  const today = beijingDate();
  const todayDow = new Date(today + 'T00:00:00Z').getUTCDay();

  // 下一个开奖日
  let offset = 0;
  for (let i = 0; i <= 7; i++) {
    const dow = (todayDow + i) % 7;
    if (g.drawDays.includes(dow)) { offset = i; break; }
  }
  const nextDate = new Date(new Date(today + 'T00:00:00Z').getTime() + offset * 86400000).toISOString().slice(0, 10);

  let issue = null;
  if (last?.issue) {
    const s = String(last.issue);
    if (/^\d{5,}$/.test(s)) {
      const yearLen = s.length - 3;              // 大乐透 "26"，双色球 "2026"
      const prefix = s.slice(0, yearLen);
      const seq = parseInt(s.slice(-3), 10);
      const lastYear = Number(prefix.length <= 2 ? '20' + prefix : prefix);
      const nextYear = Number(nextDate.slice(0, 4));
      if (nextYear > lastYear) {
        issue = (prefix.length <= 2 ? String(nextYear).slice(2) : String(nextYear)) + '001';
      } else {
        issue = prefix + String(seq + 1).padStart(3, '0');
      }
    }
  }
  return { game, issue, draw_date: nextDate, draw_time: g.drawTime, name: g.name };
}

// ===== 中奖判定 =====

function hitCount(mine, draw) {
  const ds = new Set(draw);
  return mine.filter((n) => ds.has(n)).length;
}

/** 大乐透 2026 新规：13 个中奖条件 → 7 个奖级 */
export function dltLevel(f, b) {
  if (f === 5 && b === 2) return 1;
  if (f === 5 && b === 1) return 2;
  if ((f === 5 && b === 0) || (f === 4 && b === 2)) return 3;
  if (f === 4 && b === 1) return 4;
  if ((f === 4 && b === 0) || (f === 3 && b === 2)) return 5;
  if ((f === 3 && b === 1) || (f === 2 && b === 2)) return 6;
  if ((f === 3 && b === 0) || (f === 2 && b === 1) || (f === 1 && b === 2) || (f === 0 && b === 2)) return 7;
  return 0;
}

/** 双色球 */
export function ssqLevel(r, b) {
  if (r === 6 && b === 1) return 1;
  if (r === 6 && b === 0) return 2;
  if (r === 5 && b === 1) return 3;
  if ((r === 5 && b === 0) || (r === 4 && b === 1)) return 4;
  if ((r === 4 && b === 0) || (r === 3 && b === 1)) return 5;
  if ((r === 2 && b === 1) || (r === 1 && b === 1) || (r === 0 && b === 1)) return 6;
  return 0;
}

/** 判定一注 → { level, hitMain, hitExtra, hitText } */
export function judge(game, mine, drawNums) {
  const mm = normalizeNumbers(game, mine);
  const dd = normalizeNumbers(game, drawNums);
  if (!mm || !dd) return { level: 0, hitMain: 0, hitExtra: 0, hitText: '' };
  const hm = hitCount(mm.main, dd.main);
  const he = hitCount(mm.extra, dd.extra);
  const level = game === 'dlt' ? dltLevel(hm, he) : ssqLevel(hm, he);
  return { level, hitMain: hm, hitExtra: he, hitText: `${hm}+${he}` };
}

/** 从官方公告里取单注奖金 */
function stakeOf(draw, levelName, isAppend) {
  const want = isAppend ? `${levelName}(追加)` : levelName;
  const list = draw?.prize_levels || [];
  let hit = list.find((p) => p.name === want);
  // 官方偶用全角括号或空格
  if (!hit) hit = list.find((p) => p.name.replace(/[\s（）]/g, '') === want.replace(/[\s（）]/g, ''));
  return hit ? hit.amount : 0;
}

/**
 * 计算一注中奖金额
 * @returns {{unit:number,total:number,source:string,levelName:string}}
 */
export function calcPrize(game, level, isAppend, multiple, draw) {
  const mult = Math.max(1, Number(multiple) || 1);
  if (!level) return { unit: 0, total: 0, source: 'none', levelName: '' };
  const levelName = LEVEL_NAMES[level] || '';
  let unit = stakeOf(draw, levelName, false);
  let source = unit > 0 ? 'official' : 'fallback';

  if (isAppend && game === 'dlt') {
    const addUnit = stakeOf(draw, levelName, true);
    unit += addUnit > 0 ? addUnit : Math.round(unit * 0.8);
  }

  // 官方缺数据时的兜底（仅固定奖；一二等浮动奖无法兜底）
  if (unit === 0) {
    if (game === 'dlt') {
      const fb = DLT_FALLBACK[level];
      if (fb) unit = fb[1]; // 保守取"奖池≥8亿"档（当前奖池长期在 8 亿附近）
      else unit = 0;
    } else {
      unit = SSQ_FALLBACK[level] || 0;
    }
  }
  return { unit, total: unit * mult, source, levelName };
}

/** 对一注票对奖（需要开奖数据已在库中） */
export function checkTicket(db, ticket, { persist = true } = {}) {
  const draw = getDraw(db, ticket.game, ticket.issue);
  if (!draw) return null;
  const mine = JSON.parse(ticket.numbers || '{}');
  const r = judge(ticket.game, mine, draw.numbers);
  const prize = calcPrize(ticket.game, r.level, !!ticket.is_append, ticket.multiple || 1, draw);
  const status = r.level > 0 ? 'won' : 'lost';

  const result = {
    id: ticket.id,
    status,
    level: r.level,
    levelName: prize.levelName,
    hitText: r.hitText,
    hitMain: r.hitMain,
    hitExtra: r.hitExtra,
    prize: prize.total,
    unit: prize.unit,
    source: prize.source,
    issue: ticket.issue,
    draw: { numbers: draw.numbers, draw_date: draw.draw_date, pool: draw.pool, sales: draw.sales },
  };

  if (persist) {
    db.prepare(`
      UPDATE lottery_tickets
      SET status = ?, prize_level = ?, hit_detail = ?, prize = ?, checked_at = ?, draw_date = ?
      WHERE id = ?
    `).run(status, r.level, r.hitText, prize.total, beijingNow(), draw.draw_date, ticket.id);
  }
  return result;
}

/**
 * 批量对奖
 * @returns { checked:[], pending:[], won:[], lost:[], totalPrize:number }
 */
export function checkAll(db, userId, { game = null, persist = true } = {}) {
  const rows = db.prepare(
    `SELECT * FROM lottery_tickets WHERE user_id = ? AND issue IS NOT NULL ${game ? 'AND game = ?' : ''}`
  ).all(...(game ? [userId, game] : [userId]));

  const checked = [];
  const pending = [];
  for (const t of rows) {
    const r = checkTicket(db, t, { persist });
    if (r) checked.push(r);
    else pending.push({ id: t.id, game: t.game, issue: t.issue });
  }
  const won = checked.filter((r) => r.prize > 0);
  return {
    checked,
    pending,
    won,
    lost: checked.filter((r) => r.status === 'lost'),
    totalPrize: won.reduce((s, r) => s + r.prize, 0),
  };
}

/** 把没填期号的票，按购买日期匹配最近一期开奖 */
export function resolvePendingIssues(db, userId) {
  const rows = db.prepare("SELECT * FROM lottery_tickets WHERE user_id = ? AND (issue IS NULL OR issue = '')").all(userId);
  let fixed = 0;
  for (const t of rows) {
    const base = t.bet_date || (t.created_at || '').slice(0, 10) || beijingDate();
    const draw = db.prepare(
      'SELECT issue, draw_date FROM lottery_draws WHERE game = ? AND draw_date >= ? ORDER BY draw_date ASC LIMIT 1'
    ).get(t.game, base);
    if (!draw) continue;
    const gap = (new Date(draw.draw_date + 'T00:00:00Z') - new Date(base + 'T00:00:00Z')) / 86400000;
    if (gap < 0 || gap > 7) continue;
    db.prepare('UPDATE lottery_tickets SET issue = ?, draw_date = ? WHERE id = ?').run(draw.issue, draw.draw_date, t.id);
    fixed++;
  }
  return fixed;
}

/** 补开奖日（对已有期号的票补上 draw_date） */
export function backfillDrawDates(db, userId) {
  return db.prepare(`
    UPDATE lottery_tickets
    SET draw_date = (SELECT d.draw_date FROM lottery_draws d WHERE d.game = lottery_tickets.game AND d.issue = lottery_tickets.issue)
    WHERE user_id = ? AND issue IS NOT NULL AND (draw_date IS NULL OR draw_date = '')
      AND EXISTS (SELECT 1 FROM lottery_draws d WHERE d.game = lottery_tickets.game AND d.issue = lottery_tickets.issue)
  `).run(userId).changes;
}

// ===== 统计 =====

function periodRange(period) {
  const today = beijingDate();
  const d = new Date(today + 'T00:00:00Z');
  if (period === 'day') return { start: today, end: today };
  if (period === 'week') {
    const dow = d.getUTCDay(); // 0=周日
    const back = dow === 0 ? 6 : dow - 1; // 周一为首日
    return { start: new Date(d.getTime() - back * 86400000).toISOString().slice(0, 10), end: today };
  }
  if (period === 'month') return { start: today.slice(0, 7) + '-01', end: today };
  if (period === 'year') return { start: today.slice(0, 4) + '-01-01', end: today };
  return { start: '1970-01-01', end: today };
}

export function getStats(db, userId, period = 'month', game = null) {
  const { start, end } = periodRange(period);
  const gameSql = game ? 'AND game = ?' : '';
  const args = (extra) => (game ? [...extra, game] : extra);

  // 花费按购买日归属
  const costRow = db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(cost), 0) AS cost
    FROM lottery_tickets
    WHERE user_id = ? AND bet_date >= ? AND bet_date <= ? ${gameSql}
  `).get(...args([userId, start, end]));

  // 中奖按开奖日归属
  const prizeRow = db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(prize), 0) AS prize, COALESCE(SUM(CASE WHEN status='won' THEN 1 ELSE 0 END), 0) AS won
    FROM lottery_tickets
    WHERE user_id = ? AND draw_date >= ? AND draw_date <= ? AND status IN ('won','lost') ${gameSql}
  `).get(...args([userId, start, end]));

  const pendingRow = db.prepare(`
    SELECT COUNT(*) AS c FROM lottery_tickets
    WHERE user_id = ? AND status = 'pending' ${gameSql}
  `).get(...args([userId]));

  const byGame = {};
  for (const key of Object.keys(GAMES)) {
    if (game && key !== game) continue;
    const c = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(cost),0) AS cost FROM lottery_tickets WHERE user_id = ? AND bet_date >= ? AND bet_date <= ? AND game = ?`).get(userId, start, end, key);
    const p = db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(prize),0) AS prize, COALESCE(SUM(CASE WHEN status='won' THEN 1 ELSE 0 END),0) AS won FROM lottery_tickets WHERE user_id = ? AND draw_date >= ? AND draw_date <= ? AND game = ? AND status IN ('won','lost')`).get(userId, start, end, key);
    byGame[key] = {
      name: GAMES[key].name,
      cost: c.cost,
      betCount: c.c,
      prize: p.prize,
      wonCount: p.won,
      checkedCount: p.c,
      net: Math.round((p.prize - c.cost) * 100) / 100,
    };
  }

  // 时间线（花费 vs 中奖）
  const tlCost = db.prepare(`SELECT bet_date AS d, COUNT(*) AS c, COALESCE(SUM(cost),0) AS v FROM lottery_tickets WHERE user_id = ? AND bet_date >= ? AND bet_date <= ? ${gameSql} GROUP BY bet_date`).all(...args([userId, start, end]));
  const tlPrize = db.prepare(`SELECT draw_date AS d, COALESCE(SUM(prize),0) AS v, COALESCE(SUM(CASE WHEN status='won' THEN 1 ELSE 0 END),0) AS w FROM lottery_tickets WHERE user_id = ? AND draw_date >= ? AND draw_date <= ? AND status IN ('won','lost') ${gameSql} GROUP BY draw_date`).all(...args([userId, start, end]));
  const tlMap = {};
  for (const r of tlCost) tlMap[r.d] = { date: r.d, cost: r.v, betCount: r.c, prize: 0, wonCount: 0 };
  for (const r of tlPrize) {
    if (!tlMap[r.d]) tlMap[r.d] = { date: r.d, cost: 0, betCount: 0, prize: 0, wonCount: 0 };
    tlMap[r.d].prize = r.v;
    tlMap[r.d].wonCount = r.w;
  }
  const timeline = Object.values(tlMap).sort((a, b) => (a.date < b.date ? -1 : 1));

  const cost = Math.round(costRow.cost * 100) / 100;
  const prize = Math.round(prizeRow.prize * 100) / 100;
  return {
    period,
    game: game || 'all',
    range: { start, end },
    summary: {
      cost,
      prize,
      net: Math.round((prize - cost) * 100) / 100,
      betCount: costRow.c,
      checkedCount: prizeRow.c,
      wonCount: prizeRow.won,
      lostCount: prizeRow.c - prizeRow.won,
      pendingCount: pendingRow.c,
      winRate: prizeRow.c > 0 ? Math.round((prizeRow.won / prizeRow.c) * 1000) / 10 : 0,
      roi: cost > 0 ? Math.round(((prize - cost) / cost) * 1000) / 10 : 0,
    },
    byGame,
    timeline,
    updatedAt: beijingNow(),
  };
}

// ===== 提醒文案 =====

export function buildResultMessage(results, gameLabel = '') {
  const won = results.filter((r) => r.prize > 0);
  const lost = results.filter((r) => r.status === 'lost');
  const total = won.reduce((s, r) => s + r.prize, 0);
  const head = gameLabel ? `${gameLabel}开奖结果` : '开奖结果';

  if (!results.length) return '';
  if (!won.length) {
    return `🎟️ ${head}出来了：这次 ${lost.length} 注都没中，下次继续～`;
  }
  const lines = won.map((r) => {
    const detail = r.hitText ? `（${r.hitText}）` : '';
    return `${r.levelName}${detail} · ${r.prize} 元`;
  });
  const parts = [`🎉 ${head}出来了！${won.length} 注中奖，合计 ${total} 元`, ...lines.map((l) => '  · ' + l)];
  if (lost.length) parts.push(`另外 ${lost.length} 注未中。`);
  return parts.join('\n');
}

export { LEVEL_NAMES };
