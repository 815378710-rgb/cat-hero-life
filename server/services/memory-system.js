// 猫猫侠 三层记忆系统 - 工作记忆/短期记忆/长期记忆 + 语义检索
import { v4 as uuid } from 'uuid';

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
    db.prepare('UPDATE memory_system SET access_count = access_count + 1, last_accessed = datetime("now") WHERE id = ?').run(m.id);
  }

  return memories;
}

// 获取上下文记忆 (用于对话)
export function getContextMemories(db, userId, limit = 8) {
  // 工作记忆: 最近对话
  const working = db.prepare('SELECT * FROM memory_system WHERE user_id = ? AND memory_layer = "working" ORDER BY created_at DESC LIMIT 3').all(userId);

  // 短期记忆: 最近一周重要事件
  const shortTerm = db.prepare('SELECT * FROM memory_system WHERE user_id = ? AND memory_layer = "short_term" AND created_at >= datetime("now", "-7 days") ORDER BY importance DESC LIMIT 3').all(userId);

  // 长期记忆: 高重要度
  const longTerm = db.prepare('SELECT * FROM memory_system WHERE user_id = ? AND memory_layer = "long_term" ORDER BY importance DESC LIMIT 2').all(userId);

  return { working, shortTerm, longTerm, all: [...working, ...shortTerm, ...longTerm] };
}

// 记忆固化 (短期 → 长期)
export function consolidateMemories(db, userId) {
  // 找访问次数达到阈值的短期记忆
  const candidates = db.prepare(`SELECT * FROM memory_system WHERE user_id = ? AND memory_layer = 'short_term' AND access_count >= ?`).all(userId, PROMOTE_THRESHOLD);

  for (const mem of candidates) {
    db.prepare('UPDATE memory_system SET memory_layer = "long_term", decay_rate = ?, updated_at = datetime("now") WHERE id = ?')
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
  const working = db.prepare('SELECT COUNT(*) as c FROM memory_system WHERE user_id = ? AND memory_layer = "working"').get(userId).c;
  const shortTerm = db.prepare('SELECT COUNT(*) as c FROM memory_system WHERE user_id = ? AND memory_layer = "short_term"').get(userId).c;
  const longTerm = db.prepare('SELECT COUNT(*) as c FROM memory_system WHERE user_id = ? AND memory_layer = "long_term"').get(userId).c;
  const total = working + shortTerm + longTerm;
  return { working, shortTerm, longTerm, total };
}
