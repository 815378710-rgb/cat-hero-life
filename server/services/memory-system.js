// 猫猫侠 三层记忆系统 - 工作记忆/短期记忆/长期记忆 + 语义检索
import { v4 as uuid } from 'uuid';
import { chatWithLLM, isAiEnabled } from './ai-engine.js';
import { ingestTags } from './concept-graph.js';

const DECAY_RATES = { working: 1.0, short_term: 0.1, long_term: 0.01 };
const PROMOTE_THRESHOLD = 3;  // 被访问3次升级
const LONG_TERM_THRESHOLD = 5;

// 添加记忆
export function addMemory(db, userId, layer, type, title, content, summary, importance = 5, source = 'system', tags = []) {
  const id = uuid();
  db.prepare(`INSERT INTO memory_system (id, user_id, memory_layer, memory_type, title, content, summary, importance, decay_rate, tags, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, layer, type, title, content, summary, importance, DECAY_RATES[layer], JSON.stringify(tags), source);
  return id;
}

// 检索记忆 (基于关键词 + 重要度)
export function retrieveMemories(db, userId, query, limit = 10) {
  // 分词 (简单中文分词)
  const keywords = extractKeywords(query);
  if (keywords.length === 0) {
    return db.prepare('SELECT * FROM memory_system WHERE user_id = ? ORDER BY importance DESC, created_at DESC LIMIT ?').all(userId, limit);
  }

  // 构建LIKE查询
  const conditions = keywords.map(() => '(title LIKE ? OR content LIKE ? OR summary LIKE ?)').join(' OR ');
  const params = keywords.flatMap(k => [`%${k}%`, `%${k}%`, `%${k}%`]);

  const memories = db.prepare(`SELECT * FROM memory_system WHERE user_id = ? AND (${conditions}) ORDER BY importance DESC, created_at DESC LIMIT ?`).all(userId, ...params, limit);

  // 更新访问计数
  for (const m of memories) {
    db.prepare("UPDATE memory_system SET access_count = access_count + 1, last_accessed = datetime('now') WHERE id = ?").run(m.id);
  }

  return memories;
}

// 获取上下文记忆 (用于对话)
export function getContextMemories(db, userId, limit = 8) {
  // 工作记忆: 最近对话
  const working = db.prepare("SELECT * FROM memory_system WHERE user_id = ? AND memory_layer = 'working' ORDER BY created_at DESC LIMIT 3").all(userId);

  // 短期记忆: 最近一周重要事件
  const shortTerm = db.prepare("SELECT * FROM memory_system WHERE user_id = ? AND memory_layer = 'short_term' AND created_at >= datetime('now', '-7 days') ORDER BY importance DESC LIMIT 3").all(userId);

  // 长期记忆: 高重要度
  const longTerm = db.prepare("SELECT * FROM memory_system WHERE user_id = ? AND memory_layer = 'long_term' ORDER BY importance DESC LIMIT 2").all(userId);

  return { working, shortTerm, longTerm, all: [...working, ...shortTerm, ...longTerm] };
}

// 记忆固化 (短期 → 长期)
export function consolidateMemories(db, userId) {
  // 找访问次数达到阈值的短期记忆
  const candidates = db.prepare(`SELECT * FROM memory_system WHERE user_id = ? AND memory_layer = 'short_term' AND access_count >= ?`).all(userId, PROMOTE_THRESHOLD);

  for (const mem of candidates) {
    db.prepare("UPDATE memory_system SET memory_layer = 'long_term', decay_rate = ?, updated_at = datetime('now') WHERE id = ?")
      .run(DECAY_RATES.long_term, mem.id);
  }

  return candidates.length;
}

// 记忆衰减 (定期清理)
export function decayMemories(db, userId) {
  // 降低长期未访问的记忆重要度
  db.prepare(`UPDATE memory_system SET importance = MAX(0, importance - decay_rate) WHERE user_id = ? AND memory_layer IN ('short_term', 'long_term') AND (last_accessed IS NULL OR last_accessed < datetime('now', '-30 days'))`).run(userId);

  // 删除重要度归零的记忆
  const deleted = db.prepare(`DELETE FROM memory_system WHERE user_id = ? AND importance <= 0 AND memory_layer != 'long_term'`).run(userId);

  return deleted.changes;
}

// 关联记忆
export function linkMemories(db, memoryId1, memoryId2) {
  const mem1 = db.prepare('SELECT related_memories FROM memory_system WHERE id = ?').get(memoryId1);
  const mem2 = db.prepare('SELECT related_memories FROM memory_system WHERE id = ?').get(memoryId2);

  if (mem1) {
    const links = JSON.parse(mem1.related_memories || '[]');
    if (!links.includes(memoryId2)) { links.push(memoryId2); db.prepare('UPDATE memory_system SET related_memories = ? WHERE id = ?').run(JSON.stringify(links), memoryId1); }
  }
  if (mem2) {
    const links = JSON.parse(mem2.related_memories || '[]');
    if (!links.includes(memoryId1)) { links.push(memoryId1); db.prepare('UPDATE memory_system SET related_memories = ? WHERE id = ?').run(JSON.stringify(links), memoryId2); }
  }
}

// 简单中文关键词提取
function extractKeywords(text) {
  const words = text.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
  const stopWords = ['主人', '猫猫', '什么', '可以', '已经', '今天', '明天', '这个', '那个', '怎么', '一个', '不是', '但是', '因为', '所以'];
  return words.filter(w => !stopWords.includes(w) && w.length >= 2).slice(0, 5);
}

// 从对话自动提取并存储记忆
export function extractFromConversation(db, userId, userMessage, aiResponse, emotion, importance) {
  // 只有重要对话才存储
  if (importance < 4) return null;

  const layer = importance >= 7 ? 'short_term' : 'working';
  const title = userMessage.slice(0, 30);

  return addMemory(db, userId, layer, 'conversation', title, `${userMessage} → ${aiResponse}`, aiResponse.slice(0, 100), importance, 'chat', [emotion].filter(Boolean));
}

// 获取记忆统计
export function getMemoryStats(db, userId) {
  const working = db.prepare("SELECT COUNT(*) as c FROM memory_system WHERE user_id = ? AND memory_layer = 'working'").get(userId).c;
  const shortTerm = db.prepare("SELECT COUNT(*) as c FROM memory_system WHERE user_id = ? AND memory_layer = 'short_term'").get(userId).c;
  const longTerm = db.prepare("SELECT COUNT(*) as c FROM memory_system WHERE user_id = ? AND memory_layer = 'long_term'").get(userId).c;
  const total = working + shortTerm + longTerm;
  return { working, shortTerm, longTerm, total };
}

// ===== 语义检索升级 =====

// 使用 LLM 从文本中提取语义标签
export async function extractSemanticTags(text, existingTags = []) {
  if (!isAiEnabled()) {
    // 降级：用关键词作为标签
    return extractKeywords(text);
  }

  try {
    const prompt = `从以下内容中提取3-5个语义标签。标签应该是简短的中文词或短语（2-6字），覆盖内容的核心主题、情感、事件类型。

内容：
${text.slice(0, 500)}

${existingTags.length > 0 ? `已有标签参考（可沿用或新增）：${existingTags.join(', ')}` : ''}

返回纯JSON数组：["标签1","标签2","标签3"]
只返回JSON数组，不要其他文字。`;

    const result = await chatWithLLM([{ role: 'user', content: prompt }], { temperature: 0.1, maxTokens: 100 });
    if (result) {
      const match = result.match(/\[[\s\S]*?\]/)?.[0];
      if (match) {
        const tags = JSON.parse(match);
        return Array.isArray(tags) ? tags.slice(0, 8) : [];
      }
    }
  } catch (e) {
    console.error('extractSemanticTags:', e.message);
  }
  
  return extractKeywords(text);
}

// 语义检索：标签匹配 + 重要度 + 时间衰减 → 排序
export function semanticRetrieve(db, userId, queryTags, limit = 10) {
  // 获取所有记忆（做内存内排序，因为 tags 是 JSON 字段）
  const allMemories = db.prepare(
    'SELECT * FROM memory_system WHERE user_id = ? ORDER BY created_at DESC LIMIT 100'
  ).all(userId);

  if (allMemories.length === 0) return [];

  const now = Date.now();
  const scored = allMemories.map(m => {
    let tagScore = 0;
    try {
      const tags = JSON.parse(m.tags || '[]');
      for (const qt of queryTags) {
        for (const t of tags) {
          if (t.includes(qt) || qt.includes(t)) {
            tagScore += 1;
          }
        }
      }
      // 归一化：最多匹配数 / 总标签数
      tagScore = tags.length > 0 ? tagScore / Math.max(tags.length, queryTags.length) : 0;
    } catch {}

    // 时间衰减：越近分越高（半衰期7天）
    const ageMs = now - new Date(m.created_at + 'Z').getTime();
    const halfLifeDays = 7;
    const recencyScore = Math.pow(0.5, ageMs / (halfLifeDays * 86400000));

    // 重要度：1-10 → 0.1-1.0
    const importanceScore = (m.importance || 5) / 10;

    // 综合分：标签50% + 重要度30% + 时间20%
    const score = tagScore * 0.5 + importanceScore * 0.3 + recencyScore * 0.2;

    return { ...m, _score: score, _tagScore: tagScore, _recency: recencyScore };
  });

  // 按综合分排序，取 top N
  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, limit);
}

// 语义上下文记忆（供对话使用）
export async function getSemanticContextMemories(db, userId, currentMessage, limit = 8) {
  // 提取当前消息的语义标签
  const queryTags = await extractSemanticTags(currentMessage);
  
  // 将标签喂给概念图（动态神经元学习）
  if (queryTags.length > 0) {
    ingestTags(userId, queryTags);
  }
  
  if (queryTags.length === 0) {
    // 降级到原有逻辑
    return getContextMemories(db, userId, limit);
  }

  // 语义检索
  const memories = semanticRetrieve(db, userId, queryTags, limit);
  
  // 按记忆层级分组
  const working = memories.filter(m => m.memory_layer === 'working').slice(0, 3);
  const shortTerm = memories.filter(m => m.memory_layer === 'short_term').slice(0, 3);
  const longTerm = memories.filter(m => m.memory_layer === 'long_term').slice(0, 2);

  return {
    working, shortTerm, longTerm,
    all: memories.slice(0, limit),
    _queryTags: queryTags,
    _semantic: true,
  };
}

// 给记忆补充语义标签（用于存储时）
export async function enrichMemoryWithTags(db, memoryId, content) {
  const tags = await extractSemanticTags(content);
  if (tags.length > 0) {
    try {
      db.prepare('UPDATE memory_system SET tags = ? WHERE id = ?')
        .run(JSON.stringify(tags), memoryId);
    } catch (e) {
      console.error('enrichMemoryWithTags:', e.message);
    }
  }
  return tags;
}

// 从对话自动提取并存储记忆（升级版：带语义标签）
export async function extractFromConversationSemantic(db, userId, userMessage, aiResponse, emotion, importance) {
  if (importance < 4) return null;

  const layer = importance >= 7 ? 'short_term' : 'working';
  const title = userMessage.slice(0, 30);
  const content = `${userMessage} → ${aiResponse}`;
  
  // 提取语义标签
  const tags = await extractSemanticTags(content, [emotion].filter(Boolean));

  return addMemory(db, userId, layer, 'conversation', title, content, aiResponse.slice(0, 100), importance, 'chat', tags);
}
