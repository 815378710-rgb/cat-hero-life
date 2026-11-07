// 猫猫侠 · 彩票板块 API
import { Router } from 'express';
import {
  GAMES, beijingDate, normalizeNumbers, syncDraws, syncAllDraws, getDraw, nextIssue,
  checkTicket, checkAll, resolvePendingIssues, backfillDrawDates,
  getStats, buildResultMessage, LEVEL_NAMES,
} from '../services/lottery-service.js';
import { analyzeImage, saveBase64Image } from '../services/multimodal-service.js';

const router = Router();

function getUserId(db) {
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  return user ? user.id : null;
}

function rowToTicket(r) {
  let numbers = {};
  try { numbers = JSON.parse(r.numbers || '{}'); } catch { numbers = {}; }
  const g = GAMES[r.game] || {};
  return {
    id: r.id,
    game: r.game,
    gameName: g.name || r.game,
    issue: r.issue,
    betDate: r.bet_date,
    drawDate: r.draw_date,
    numbers,
    multiple: r.multiple || 1,
    isAppend: !!r.is_append,
    cost: r.cost || 0,
    image: r.image,
    status: r.status,
    level: r.prize_level || 0,
    levelName: r.prize_level ? LEVEL_NAMES[r.prize_level] : '',
    hitText: r.hit_detail || '',
    prize: r.prize || 0,
    checkedAt: r.checked_at,
    note: r.note,
    createdAt: r.created_at,
  };
}

function numText(n, width = 2) {
  return String(Number(n)).padStart(width, '0');
}

// ===== 玩法元信息 =====

router.get('/meta', (req, res) => {
  const db = req.db;
  try {
    const games = Object.values(GAMES).map((g) => ({
      key: g.key,
      name: g.name,
      short: g.short,
      icon: g.icon,
      main: g.main,
      extra: g.extra,
      basePrice: g.basePrice,
      appendPrice: g.appendPrice,
      levels: g.levels,
      drawDays: g.drawDays,
      drawTime: g.drawTime,
      next: nextIssue(db, g.key),
    }));
    res.json({ games });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 概览（统计 + 最近票据 + 最近开奖）=====

router.get('/overview', async (req, res) => {
  const db = req.db;
  try {
    const userId = getUserId(db);
    if (!userId) return res.status(400).json({ error: '用户不存在' });

    const period = ['day', 'week', 'month', 'year', 'all'].includes(req.query.period) ? req.query.period : 'month';
    const game = GAMES[req.query.game] ? req.query.game : null;

    // 首次使用：自动拉一次开奖数据
    const hasDraws = db.prepare('SELECT COUNT(*) AS c FROM lottery_draws').get().c;
    if (!hasDraws) {
      try { await syncAllDraws(db, 30); } catch (e) { console.error('[lottery] 首次同步开奖失败:', e.message); }
    }

    resolvePendingIssues(db, userId);
    backfillDrawDates(db, userId);
    checkAll(db, userId, { persist: true });

    const stats = getStats(db, userId, period, game);
    const tickets = db.prepare(
      `SELECT * FROM lottery_tickets WHERE user_id = ? ${game ? 'AND game = ?' : ''} ORDER BY id DESC LIMIT 30`
    ).all(...(game ? [userId, game] : [userId]));

    const draws = {};
    for (const key of ['dlt', 'ssq']) {
      const latest = db.prepare('SELECT * FROM lottery_draws WHERE game = ? ORDER BY issue DESC LIMIT 1').get(key);
      if (latest) {
        draws[key] = {
          issue: latest.issue,
          draw_date: latest.draw_date,
          numbers: JSON.parse(latest.numbers || '{}'),
          pool: latest.pool,
          sales: latest.sales,
          prize_levels: JSON.parse(latest.prize_levels || '[]'),
        };
      }
    }

    const gameInfo = {};
    for (const key of ['dlt', 'ssq']) gameInfo[key] = { name: GAMES[key].name, drawDays: GAMES[key].drawDays, drawTime: GAMES[key].drawTime };

    res.json({
      period,
      game: game || 'all',
      stats,
      tickets: tickets.map(rowToTicket),
      draws,
      gameInfo,
      today: beijingDate(),
    });
  } catch (e) {
    console.error('[lottery/overview]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===== 票据 =====

router.get('/tickets', (req, res) => {
  const db = req.db;
  try {
    const userId = getUserId(db);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const conds = ['user_id = ?'];
    const args = [userId];
    if (GAMES[req.query.game]) { conds.push('game = ?'); args.push(req.query.game); }
    if (['pending', 'won', 'lost'].includes(req.query.status)) { conds.push('status = ?'); args.push(req.query.status); }
    const rows = db.prepare(`SELECT * FROM lottery_tickets WHERE ${conds.join(' AND ')} ORDER BY id DESC LIMIT ?`).all(...args, limit);
    res.json({ tickets: rows.map(rowToTicket) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function buildTicket(db, userId, b) {
  const game = GAMES[b.game] ? b.game : null;
  if (!game) return { error: '未知玩法' };
  const numbers = normalizeNumbers(game, b.numbers || b);
  if (!numbers) return { error: '号码不合法（个数或范围不对）' };
  const g = GAMES[game];
  const multiple = Math.min(99, Math.max(1, parseInt(b.multiple, 10) || 1));
  const isAppend = game === 'dlt' && (b.isAppend === true || b.isAppend === 'true' || b.isAppend === 1);
  const defaultCost = (g.basePrice + (isAppend ? g.appendPrice : 0)) * multiple;
  const cost = Number.isFinite(Number(b.cost)) && Number(b.cost) >= 0 ? Number(b.cost) : defaultCost;
  return {
    game,
    issue: b.issue ? String(b.issue).trim() : null,
    betDate: b.betDate || beijingDate(),
    numbers,
    multiple,
    isAppend,
    cost,
    image: b.image || null,
    note: b.note || null,
  };
}

router.post('/tickets', (req, res) => {
  const db = req.db;
  try {
    const userId = getUserId(db);
    const t = buildTicket(db, userId, req.body || {});
    if (t.error) return res.status(400).json(t);

    const draw = t.issue ? getDraw(db, t.game, t.issue) : null;
    const info = db.prepare(`
      INSERT INTO lottery_tickets
        (user_id, game, issue, bet_date, draw_date, numbers, multiple, is_append, cost, image, status, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      userId, t.game, t.issue, t.betDate, draw ? draw.draw_date : null,
      JSON.stringify(t.numbers), t.multiple, t.isAppend ? 1 : 0, t.cost, t.image, t.note,
      new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
    );
    const row = db.prepare('SELECT * FROM lottery_tickets WHERE id = ?').get(info.lastInsertRowid);
    const checked = draw ? checkTicket(db, row, { persist: true }) : null;
    const fresh = db.prepare('SELECT * FROM lottery_tickets WHERE id = ?').get(info.lastInsertRowid);
    res.json({ ticket: rowToTicket(fresh), checked });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tickets/bulk', (req, res) => {
  const db = req.db;
  try {
    const userId = getUserId(db);
    const list = Array.isArray(req.body?.tickets) ? req.body.tickets : [];
    if (!list.length) return res.status(400).json({ error: '没有要保存的票据' });
    const shared = { issue: req.body.issue, betDate: req.body.betDate, image: req.body.image, note: req.body.note };

    const created = [];
    const errors = [];
    const insert = db.prepare(`
      INSERT INTO lottery_tickets
        (user_id, game, issue, bet_date, draw_date, numbers, multiple, is_append, cost, image, status, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `);
    const now = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');

    const tx = db.transaction(() => {
      for (const item of list) {
        const t = buildTicket(db, userId, { ...shared, ...item });
        if (t.error) { errors.push({ item, error: t.error }); continue; }
        const draw = t.issue ? getDraw(db, t.game, t.issue) : null;
        const info = insert.run(
          userId, t.game, t.issue, t.betDate, draw ? draw.draw_date : null,
          JSON.stringify(t.numbers), t.multiple, t.isAppend ? 1 : 0, t.cost, t.image, t.note, now
        );
        const row = db.prepare('SELECT * FROM lottery_tickets WHERE id = ?').get(info.lastInsertRowid);
        const checked = draw ? checkTicket(db, row, { persist: true }) : null;
        created.push(rowToTicket(db.prepare('SELECT * FROM lottery_tickets WHERE id = ?').get(info.lastInsertRowid)));
        if (checked) created[created.length - 1].checked = checked;
      }
    });
    tx();

    res.json({ created, errors, count: created.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/tickets/:id', (req, res) => {
  const db = req.db;
  try {
    const userId = getUserId(db);
    const row = db.prepare('SELECT * FROM lottery_tickets WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    if (!row) return res.status(404).json({ error: '票据不存在' });
    const b = req.body || {};
    const game = row.game;
    const numbers = b.numbers ? normalizeNumbers(game, b.numbers) : JSON.parse(row.numbers || '{}');
    if (!numbers) return res.status(400).json({ error: '号码不合法' });
    const multiple = b.multiple !== undefined ? Math.min(99, Math.max(1, parseInt(b.multiple, 10) || 1)) : row.multiple;
    const isAppend = game === 'dlt' && b.isAppend !== undefined ? (b.isAppend === true || b.isAppend === 'true' || b.isAppend === 1) : !!row.is_append;
    const cost = b.cost !== undefined ? Number(b.cost) : row.cost;
    const issue = b.issue !== undefined ? (b.issue ? String(b.issue).trim() : null) : row.issue;
    const draw = issue ? getDraw(db, game, issue) : null;

    db.prepare(`
      UPDATE lottery_tickets SET issue = ?, numbers = ?, multiple = ?, is_append = ?, cost = ?, note = ?, draw_date = ?,
        status = 'pending', prize = 0, prize_level = 0, hit_detail = NULL, checked_at = NULL
      WHERE id = ?
    `).run(issue, JSON.stringify(numbers), multiple, isAppend ? 1 : 0, cost, b.note ?? row.note, draw ? draw.draw_date : null, row.id);

    const fresh = db.prepare('SELECT * FROM lottery_tickets WHERE id = ?').get(row.id);
    const checked = draw ? checkTicket(db, fresh, { persist: true }) : null;
    res.json({ ticket: rowToTicket(db.prepare('SELECT * FROM lottery_tickets WHERE id = ?').get(row.id)), checked });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/tickets/:id', (req, res) => {
  const db = req.db;
  try {
    const userId = getUserId(db);
    const info = db.prepare('DELETE FROM lottery_tickets WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    res.json({ deleted: info.changes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 照片识别 =====

const RECOGNIZE_PROMPT = `你是彩票识别助手。请仔细识别这张中国彩票照片，只输出一个 JSON 对象，不要任何解释文字。

规则：
- 超级大乐透 game="dlt"：前区 5 个号码（01-35）+ 后区 2 个号码（01-12）
- 双色球 game="ssq"：红球 6 个号码（01-33）+ 蓝球 1 个号码（01-16）
- 号码一律输出为不含前导零的整数数组，如 [1,3,5,10,22]
- 票面若有多注（多行号码 / 复式拆出的多注），每注拆成一个 tickets 元素
- 期号在票面上通常标为「期号」「期」，如 26113；识别不到就填空字符串
- 倍数识别不到填 1；大乐透的「追加」若票面有标注则为 true
- cost 为这张票的总金额（元），识别不到填 0

输出格式：
{"game":"dlt","issue":"26113","betDate":"2026-10-04","multiple":1,"isAppend":false,"cost":6,"tickets":[{"main":[1,3,5,10,22],"extra":[3,9]}],"confidence":"high","remark":""}

confidence 取 high / medium / low，表示你对识别结果的把握。`;

function extractJson(text) {
  if (!text) return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}

router.post('/recognize', async (req, res) => {
  const db = req.db;
  try {
    const userId = getUserId(db);
    const image = req.body?.image;
    if (!image || typeof image !== 'string') return res.status(400).json({ error: '缺少图片' });

    let saved = null;
    try { saved = saveBase64Image(image); } catch (e) { console.error('[lottery] 图片保存失败:', e.message); }

    const out = await analyzeImage(image, RECOGNIZE_PROMPT);
    if (out.error) return res.status(502).json({ error: out.error, image: saved?.filename || null });

    const parsed = extractJson(out.text);
    if (!parsed) {
      return res.json({ ok: false, image: saved?.filename || null, raw: out.text || '', error: '没能从图片里读出彩票信息' });
    }

    const game = GAMES[parsed.game] ? parsed.game : null;
    const items = Array.isArray(parsed.tickets) ? parsed.tickets : [];
    const normalized = [];
    for (const it of items) {
      const n = normalizeNumbers(game, it);
      if (n) normalized.push(n);
    }

    res.json({
      ok: normalized.length > 0,
      image: saved ? '/uploads/' + saved.filename : null,
      game,
      gameName: game ? GAMES[game].name : '',
      issue: parsed.issue ? String(parsed.issue).trim() : '',
      betDate: parsed.betDate || beijingDate(),
      multiple: Math.max(1, parseInt(parsed.multiple, 10) || 1),
      isAppend: !!parsed.isAppend,
      cost: Number(parsed.cost) || 0,
      tickets: normalized,
      confidence: parsed.confidence || 'medium',
      remark: parsed.remark || '',
      raw: out.text || '',
    });
  } catch (e) {
    console.error('[lottery/recognize]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ===== 开奖 & 对奖 =====

router.get('/draws', async (req, res) => {
  const db = req.db;
  try {
    const game = GAMES[req.query.game] ? req.query.game : 'dlt';
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    if (req.query.refresh === '1') {
      try { await syncDraws(db, game, Math.max(limit, 20)); } catch (e) { console.error('[lottery] 刷新开奖失败:', e.message); }
    }
    const rows = db.prepare('SELECT * FROM lottery_draws WHERE game = ? ORDER BY issue DESC LIMIT ?').all(game, limit);
    res.json({
      game,
      draws: rows.map((r) => ({
        issue: r.issue,
        draw_date: r.draw_date,
        numbers: JSON.parse(r.numbers || '{}'),
        prize_levels: JSON.parse(r.prize_levels || '[]'),
        pool: r.pool,
        sales: r.sales,
      })),
      next: nextIssue(db, game),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/sync', async (req, res) => {
  const db = req.db;
  try {
    const userId = getUserId(db);
    const results = await syncAllDraws(db, 30);
    const fixed = resolvePendingIssues(db, userId);
    backfillDrawDates(db, userId);
    const outcome = checkAll(db, userId, { persist: true });
    res.json({ results, fixed, checked: outcome.checked.length, pending: outcome.pending.length, won: outcome.won.length, totalPrize: outcome.totalPrize });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/check', async (req, res) => {
  const db = req.db;
  try {
    const userId = getUserId(db);
    const game = GAMES[req.query.game] ? req.query.game : (GAMES[req.body?.game] ? req.body.game : null);
    // 若最近开奖还没拉过，先同步
    try { await syncDraws(db, game || 'dlt', 20); } catch (e) { /* 忽略网络错误 */ }
    if (!game) { try { await syncDraws(db, 'ssq', 20); } catch (e) { /* ignore */ } }

    const fixed = resolvePendingIssues(db, userId);
    backfillDrawDates(db, userId);
    const outcome = checkAll(db, userId, { game, persist: true });
    const message = buildResultMessage(outcome.checked, game ? GAMES[game].name : '');
    res.json({
      fixed,
      checked: outcome.checked,
      pending: outcome.pending,
      wonCount: outcome.won.length,
      totalPrize: outcome.totalPrize,
      message,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/stats', (req, res) => {
  const db = req.db;
  try {
    const userId = getUserId(db);
    const period = ['day', 'week', 'month', 'year', 'all'].includes(req.query.period) ? req.query.period : 'month';
    const game = GAMES[req.query.game] ? req.query.game : null;
    res.json(getStats(db, userId, period, game));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
