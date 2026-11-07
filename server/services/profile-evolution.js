// 动态画像进化引擎 —— 从对话中持续学习用户画像
// 每次对话后分析内容，更新 profile、发现新模式、追踪变化
import { getDb } from '../db/init.js';
import { chatWithLLM } from './ai-engine.js';

const EVOLVE_INTERVAL = 1800000; // 30分钟冷却，避免频繁分析

let lastEvolveTime = 0;
const EVOLVE_PROMPT = `你是用户画像分析师。从以下对话中提取新的用户信息。

【当前档案】
{profile}

【最近对话】
{recentChats}

【已有记忆】
{memories}

【用户属性变化（近一周）】
{statsDiff}

请分析并返回JSON：
{
  "updates": {
    "current_challenges": ["新增的挑战"],
    "strengths": ["新发现或确认的优势"],
    "personality_traits": ["新发现的性格特征"],
    "financial_goal": "财务目标变化",
    "mood_trend": "近一周情绪趋势描述",
    "key_events": ["近期的关键人生事件"]
  },
  "insights": ["对用户的新洞察"],
  "should_onboard": false
}

只返回JSON。`;

// ===== 核心：从对话中学 =====

export async function evolveProfile(db, userId) {
  try {
    const now = Date.now();
    if (now - lastEvolveTime < EVOLVE_INTERVAL) return null;
    lastEvolveTime = now;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(userId);
    if (!user || !profile) return null;

    // 最近对话
    const recentChats = db.prepare(
      "SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 30"
    ).all(userId);

    // 已有记忆
    const memories = db.prepare(
      "SELECT title, summary FROM ai_memory WHERE user_id = ? ORDER BY created_at DESC LIMIT 10"
    ).all(userId);

    if (recentChats.length < 3) return null; // 聊太少不分析

    // 属性变化
    const statsDiff = [
      `健康:${user.stat_health} 财务:${user.stat_finance} 学习:${user.stat_learning}`,
      `职业:${user.stat_career} 社交:${user.stat_social} 心理:${user.stat_mental}`,
      `习惯:${user.stat_habits} 创造:${user.stat_creativity}`,
    ].join(' ');

    // 构建档案摘要
    const profileSummary = [
      profile.gender ? `性别:${profile.gender}` : '',
      profile.birth_year ? `年龄:${new Date().getFullYear() - profile.birth_year}` : '',
      profile.current_job ? `职业:${profile.current_job}` : '',
      profile.city ? `城市:${profile.city}` : '',
      (profile.strengths || '').replace(/,/g, ', ') ? `优势:${profile.strengths}` : '',
      (profile.weaknesses || '').replace(/,/g, ', ') ? `弱点:${profile.weaknesses}` : '',
      (profile.current_challenges || '').replace(/,/g, ', ') ? `挑战:${profile.current_challenges}` : '',
    ].filter(Boolean).join('\n');

    const prompt = EVOLVE_PROMPT
      .replace('{profile}', profileSummary)
      .replace('{recentChats}', recentChats.slice(0, 20).map(m => `${m.role}: ${m.content.slice(0, 150)}`).join('\n'))
      .replace('{memories}', memories.map(m => `- ${m.title}: ${m.summary || ''}`).join('\n'))
      .replace('{statsDiff}', statsDiff);

    // 调用 LLM 分析（用低成本 flash 模型）
    const result = await chatWithLLM(prompt, 'json');
    if (!result) return null;

    const analysis = JSON.parse(result.text || result);
    if (!analysis.updates) return null;

    // 应用更新
    applyProfileUpdates(db, userId, profile, analysis.updates);

    // 记录洞察到记忆
    if (analysis.insights?.length > 0) {
      const stmt = db.prepare(
        "INSERT INTO ai_memory (id, user_id, title, summary, importance, memory_type, created_at) VALUES (?, ?, ?, ?, ?, 'insight', datetime('now'))"
      );
      analysis.insights.forEach(insight => {
        try { stmt.run(Date.now().toString(36)+Math.random().toString(36).slice(2,8), userId, '画像洞察', insight, 6); }
        catch {}
      });
    }

    console.log('[Profile Evolution] 已更新画像');
    return analysis;
  } catch (e) {
    console.error('[Profile Evolution] Error:', e.message);
    return null;
  }
}

// ===== 应用更新到数据库 =====

function applyProfileUpdates(db, userId, profile, updates) {
  const fields = ['current_challenges', 'strengths', 'weaknesses', 'personality_traits', 'hobbies', 'skills'];
  const merged = {};

  for (const field of fields) {
    const existing = profile[field] ? JSON.parse(profile[field] || '[]') : [];
    const incoming = updates[field] || [];
    if (incoming.length === 0) continue;

    // 合并去重
    const combined = [...new Set([...existing, ...incoming])];
    merged[field] = JSON.stringify(combined.slice(0, 10)); // 最多保留10项
  }

  // 财务目标
  if (updates.financial_goal) {
    merged.financial_goal = updates.financial_goal;
  }

  // 标记画像已建立
  merged.onboarding_completed = 1;

  if (Object.keys(merged).length > 0) {
    const sets = Object.keys(merged).map(k => `${k} = ?`).join(', ');
    const values = Object.values(merged);
    try {
      db.prepare(`UPDATE life_profile SET ${sets} WHERE user_id = ?`).run(...values, userId);
    } catch {}
  }
}

// ===== 注册到聊天流程 =====

export function onChatComplete(db, userId) {
  // 异步分析，不阻塞回复
  setTimeout(() => evolveProfile(db, userId).catch(() => {}), 3000);
}
