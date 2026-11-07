// 输出引擎 — 语音TTS + 文本图表 + 深度数据对比 + 真实PNG图表
// 修复项: 4.2语音 / 4.5图表 / 2.1生命周期深度
import { getDb } from '../db/init.js';
import { chatWithLLM, isAiEnabled } from './ai-engine.js';
import fs from 'fs';
import path from 'path';

// ===== 4.2 语音 TTS (node-edge-tts, 微软免费接口, 无需key) =====

export async function textToSpeech(text, voice = 'zh-CN-XiaoxiaoNeural') {
  try {
    if (!text || !text.trim()) return { error: 'empty text' };
    const { EdgeTTS } = await import('node-edge-tts');
    const dir = path.join(process.cwd(), 'data', 'tts');
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `tts_${Date.now()}.mp3`;
    const filePath = path.join(dir, fileName);
    const tts = new EdgeTTS({
      voice,
      lang: 'zh-CN',
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    });
    // node-edge-tts: ttsPromise(text, filePath) 会把 mp3 直接写到 filePath
    const result = await tts.ttsPromise(text.slice(0, 500), filePath);
    // 兜底：某些版本不写文件而是返回 buffer
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
      const audio = result?.audio || result;
      if (!audio || !Buffer.isBuffer(audio)) {
        return { error: 'TTS 返回异常: ' + JSON.stringify(result).slice(0, 100) };
      }
      fs.writeFileSync(filePath, audio);
    }
    return { audioUrl: `/tts/${fileName}`, text: text.slice(0, 80), voice };
  } catch (e) {
    return { error: e.message, _note: 'node-edge-tts 未安装或无法连接微软TTS接口' };
  }
}

// 命令行 TTS（macOS say / Windows SAPI / Linux espeak）— 作为离线降级
export async function localTTS(text) {
  try {
    const { execSync } = await import('child_process');
    const platform = process.platform;
    const clean = text.slice(0, 200).replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s,.!?，。！？]/g, '');

    if (platform === 'darwin') {
      execSync(`say "${clean}"`, { timeout: 5000 });
    } else if (platform === 'win32') {
      const { exec } = await import('child_process');
      exec(`powershell -Command "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${clean}')"`);
    } else {
      // Linux: espeak-ng（若已安装）
      execSync(`espeak-ng "${clean}"`, { timeout: 5000 });
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ===== 4.5 文本图表生成（ASCII，用于对话内展示） =====

export function generateTextChart(data, options = {}) {
  const { type = 'bar', width = 30, title = '' } = options;

  if (type === 'bar') {
    return generateBarChart(data, width, title);
  }
  if (type === 'trend') {
    return generateTrendLine(data, width, title);
  }
  if (type === 'radar') {
    return generateRadarChart(data, title);
  }
  if (type === 'table') {
    return generateFormattedTable(data, title);
  }
  return '';
}

function generateBarChart(data, width, title) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  let chart = title ? `\n📊 ${title}\n` : '\n';

  for (const item of data) {
    const barLen = Math.round((item.value / maxVal) * width);
    const bar = '█'.repeat(barLen);
    chart += `${(item.label || '').padEnd(6)} ${bar} ${item.value}\n`;
  }
  return chart;
}

function generateTrendLine(data, width, title) {
  const maxVal = Math.max(...data, 1);
  const minVal = Math.min(...data, 0);
  const range = maxVal - minVal || 1;
  let chart = title ? `\n📈 ${title}\n` : '\n';

  for (let row = 10; row >= 0; row--) {
    const val = minVal + (range * row / 10);
    let line = `${Math.round(val).toString().padStart(4)} │`;
    for (let i = 0; i < data.length && i < width; i++) {
      const pos = Math.round(((data[i] - minVal) / range) * 10);
      line += pos === row ? '●' : pos > row ? '│' : ' ';
    }
    chart += line + '\n';
  }
  chart += '     └' + '─'.repeat(Math.min(data.length, width)) + '\n';
  return chart;
}

function generateRadarChart(data, title) {
  let chart = title ? `\n🎯 ${title}\n` : '\n';
  const stats = data.map(d => `${d.label}: ${'⭐'.repeat(Math.min(5, Math.round(d.value / 20)))} ${d.value}/100`);
  chart += stats.join('\n');
  return chart;
}

function generateFormattedTable(data, title) {
  let table = title ? `\n📋 ${title}\n` : '\n';
  if (!data.headers || !data.rows) return table;

  const colWidths = data.headers.map((h, i) => {
    const max = Math.max(h.length, ...data.rows.map(r => String(r[i] || '').length));
    return max + 2;
  });

  const sep = '├' + colWidths.map(w => '─'.repeat(w)).join('┼') + '┤';
  table += '┌' + colWidths.map(w => '─'.repeat(w)).join('┬') + '┐\n';
  table += '│' + data.headers.map((h, i) => ` ${h.padEnd(colWidths[i] - 1)}`).join('│') + '│\n';
  table += sep + '\n';
  for (const row of data.rows) {
    table += '│' + row.map((cell, i) => ` ${String(cell || '').padEnd(colWidths[i] - 1)}`).join('│') + '│\n';
  }
  table += '└' + colWidths.map(w => '─'.repeat(w)).join('┴') + '┘\n';
  return table;
}

// ===== 4.5 真实 PNG 图表（@napi-rs/canvas，用于前端/微信图片展示） =====

export async function generateDashboardPNG(userId, userName) {
  try {
    const { createCanvas } = await import('@napi-rs/canvas');
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return null;

    const W = 760, H = 420;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // 背景
    ctx.fillStyle = '#0D0D0D';
    ctx.fillRect(0, 0, W, H);

    // 标题
    ctx.fillStyle = '#F0F0F0';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`${userName} · 人生仪表盘`, 24, 34);

    // 雷达图（六维属性）
    const stats = [
      { label: '健康', v: user.stat_health || 50 },
      { label: '事业', v: user.stat_career || 50 },
      { label: '财务', v: user.stat_finance || 50 },
      { label: '学习', v: user.stat_learning || 50 },
      { label: '社交', v: user.stat_social || 50 },
      { label: '心理', v: user.stat_mental || 50 },
    ];
    const cx = 180, cy = 255, R = 120;
    // 网格圈
    ctx.strokeStyle = '#2A2A2A';
    ctx.lineWidth = 1;
    for (let g = 1; g <= 4; g++) {
      const r = R * g / 4;
      ctx.beginPath();
      stats.forEach((s, i) => {
        const a = -Math.PI / 2 + i * 2 * Math.PI / stats.length;
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    }
    // 数据多边形
    ctx.fillStyle = 'rgba(94,106,210,0.35)';
    ctx.strokeStyle = '#5E6AD2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    stats.forEach((s, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / stats.length;
      const r = R * (s.v / 100);
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 轴标签 + 数值
    stats.forEach((s, i) => {
      const a = -Math.PI / 2 + i * 2 * Math.PI / stats.length;
      const x = cx + (R + 24) * Math.cos(a);
      const y = cy + (R + 24) * Math.sin(a);
      ctx.fillStyle = '#A0A0A0';
      ctx.font = '13px sans-serif';
      ctx.fillText(s.label, x - 12, y + 4);
      ctx.fillStyle = '#F0F0F0';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(String(s.v), x - 10, y + 20);
    });

    // 右侧：本周概览柱状图
    const bx = 400;
    ctx.fillStyle = '#F0F0F0';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('今日概览', bx, 70);
    const today = new Date().toISOString().split('T')[0];
    const checkins = db.prepare("SELECT COUNT(*) c FROM check_ins WHERE user_id=? AND date(checked_at)=?").get(userId, today)?.c || 0;
    const tasks = db.prepare("SELECT COUNT(*) c FROM tasks WHERE user_id=? AND scheduled_date=? AND status='completed'").get(userId, today)?.c || 0;
    const bars = [
      { label: '打卡', v: checkins },
      { label: '任务', v: tasks },
      { label: '等级', v: user.level || 1 },
      { label: '连续', v: user.consecutive_sign_days || 0 },
    ];
    const maxV = Math.max(...bars.map(b => b.v), 1);
    bars.forEach((b, i) => {
      const x = bx + i * 82;
      const h = (b.v / maxV) * 140;
      ctx.fillStyle = '#5E6AD2';
      ctx.fillRect(x, 360 - h, 52, h);
      ctx.fillStyle = '#A0A0A0';
      ctx.font = '12px sans-serif';
      ctx.fillText(b.label, x + 6, 380);
      ctx.fillStyle = '#F0F0F0';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(String(b.v), x + 20, 360 - h - 6);
    });

    const dir = path.join(process.cwd(), 'data', 'charts');
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `dash_${userId}_${Date.now()}.png`;
    fs.writeFileSync(path.join(dir, fileName), canvas.toBuffer('image/png'));
    return `/charts/${fileName}`;
  } catch (e) {
    console.error('generateDashboardPNG error:', e.message);
    return null;
  }
}

// ===== 2.1 生命周期深度：数据对比分析 =====

export function generateWeeklyComparison(userId) {
  const db = getDb();
  const thisWeek = collectWeekStats(db, userId, 0);
  const lastWeek = collectWeekStats(db, userId, 7);

  const changes = [];
  if (lastWeek.checkins > 0) {
    const diff = thisWeek.checkins - lastWeek.checkins;
    changes.push({ label: '打卡', thisWeek: thisWeek.checkins, lastWeek: lastWeek.checkins, change: diff >= 0 ? `+${diff}` : `${diff}` });
  }
  if (lastWeek.completedTasks > 0) {
    const diff = thisWeek.completedTasks - lastWeek.completedTasks;
    changes.push({ label: '完成任务', thisWeek: thisWeek.completedTasks, lastWeek: lastWeek.completedTasks, change: diff >= 0 ? `+${diff}` : `${diff}` });
  }

  const chart = generateTextChart(changes.map(c => ({ label: c.label, value: Math.max(0, c.thisWeek) })), { type: 'bar', title: '本周 vs 上周' });

  return { thisWeek, lastWeek, changes, chart };
}

function collectWeekStats(db, userId, offsetDays) {
  const start = `datetime('now', '-${7 + offsetDays} days')`;
  const end = `datetime('now', '-${offsetDays} days')`;

  return {
    checkins: db.prepare(`SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND checked_at >= ${start} AND checked_at < ${end}`).get(userId)?.c || 0,
    completedTasks: db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'completed' AND COALESCE(completed_at, created_at) >= ${start}`).get(userId)?.c || 0,
    chatCount: db.prepare(`SELECT COUNT(*) as c FROM chat_history WHERE user_id = ? AND created_at >= ${start}`).get(userId)?.c || 0,
  };
}

// ===== 健康趋势分析 =====

export function getHealthTrend(userId) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  const stats = {
    health: user.stat_health || 0,
    exercise: [],
    sleep: null,
    weight: null,
  };

  const profile = db.prepare('SELECT weight_kg FROM life_profile WHERE user_id = ?').get(userId);
  if (profile?.weight_kg) {
    stats.weight = profile.weight_kg;
  }

  const weekExercise = db.prepare(
    "SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND dimension_id = 'health' AND checked_at >= datetime('now', '-7 days')"
  ).get(userId)?.c || 0;
  stats.exercise = weekExercise;

  let advice = [];
  if (weekExercise < 2) advice.push('本周运动偏少，建议至少2-3次');
  if (weekExercise >= 5) advice.push('运动频率很好，注意休息和拉伸');
  if (stats.health < 40) advice.push('健康维度分偏低，需要更多关注身体');

  return { ...stats, advice };
}

// ===== 综合仪表盘 =====

export async function generateDashboard(userId, userName) {
  const db = getDb();
  const comparison = generateWeeklyComparison(userId);
  const health = getHealthTrend(userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const today = new Date().toISOString().split('T')[0];

  const todayCheckins = db.prepare("SELECT COUNT(*) as c FROM check_ins WHERE user_id = ? AND date(checked_at) = ?").get(userId, today)?.c || 0;
  const todayTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND scheduled_date = ? AND status = 'completed'").get(userId, today)?.c || 0;

  const radarData = [
    { label: '健康', value: user?.stat_health || 50 },
    { label: '事业', value: user?.stat_career || 50 },
    { label: '财务', value: user?.stat_finance || 50 },
    { label: '学习', value: user?.stat_learning || 50 },
    { label: '社交', value: user?.stat_social || 50 },
    { label: '心理', value: user?.stat_mental || 50 },
  ];
  const radar = generateRadarChart(radarData, '属性面板');

  const weekData = comparison.thisWeek;
  const table = generateFormattedTable({
    headers: ['指标', '本周', '上周', '变化'],
    rows: [
      ['打卡', weekData.checkins, comparison.lastWeek.checkins, comparison.changes.find(c => c.label === '打卡')?.change || '-'],
      ['完成任务', weekData.completedTasks, comparison.lastWeek.completedTasks, comparison.changes.find(c => c.label === '完成任务')?.change || '-'],
      ['聊天', weekData.chatCount, '-', '-'],
    ]
  }, '本周数据');

  // 生成真实 PNG 图表
  const chartImageUrl = await generateDashboardPNG(userId, userName);

  let summary = '';
  if (isAiEnabled()) {
    const prompt = `基于以下数据生成一句简洁的今日状态总结：

用户: ${userName}
今日打卡${todayCheckins}次，完成${todayTasks}个任务
连续签到${user?.consecutive_sign_days || 0}天
健康${user?.stat_health} 事业${user?.stat_career} 财务${user?.stat_finance} 学习${user?.stat_learning}
${health?.exercise ? `本周运动${health.exercise}次` : ''}

一句话总结（20字以内）：`;

    try {
      summary = await chatWithLLM([{ role: 'user', content: prompt }], { temperature: 0.3, maxTokens: 50 });
    } catch {}
  }

  return {
    summary: summary || `${userName}今天打卡${todayCheckins}次，完成${todayTasks}个任务`,
    radar,
    table,
    comparison: comparison.chart,
    health,
    chartImageUrl,
  };
}
