// 动态概念向量空间 — 神经元升级
// 从固定64维度计数器 → 从对话自动发现概念 + 共现关联 + 权重学习
import { getDb } from '../db/init.js';
import { v4 as uid } from 'uuid';

// ===== Schema (auto-created) =====
function ensureTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS concept_graph (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      concept TEXT NOT NULL,
      occurrences INTEGER DEFAULT 1,
      first_seen TEXT DEFAULT (datetime('now')),
      last_seen TEXT DEFAULT (datetime('now')),
      strength REAL DEFAULT 1.0,
      category TEXT,
      UNIQUE(user_id, concept)
    );
    CREATE TABLE IF NOT EXISTS concept_links (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      source_concept TEXT NOT NULL,
      target_concept TEXT NOT NULL,
      co_occurrences INTEGER DEFAULT 1,
      association_strength REAL DEFAULT 0.5,
      last_co_occurrence TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, source_concept, target_concept)
    );
    CREATE INDEX IF NOT EXISTS idx_concept_user ON concept_graph(user_id);
    CREATE INDEX IF NOT EXISTS idx_concept_links_user ON concept_links(user_id);
  `);
}

// ===== 概念发现 =====

// 从一组标签中发现/更新概念
export function ingestTags(userId, tags) {
  if (!tags || tags.length === 0) return;
  const db = getDb();
  ensureTables(db);

  const now = new Date().toISOString();

  for (const tag of tags) {
    const existing = db.prepare('SELECT * FROM concept_graph WHERE user_id = ? AND concept = ?').get(userId, tag);
    if (existing) {
      db.prepare(`
        UPDATE concept_graph SET
          occurrences = occurrences + 1, last_seen = ?,
          strength = MIN(10.0, strength + 0.5)
        WHERE id = ?
      `).run(now, existing.id);
    } else {
      db.prepare(`
        INSERT INTO concept_graph (id, user_id, concept, occurrences, strength, first_seen, last_seen, category)
        VALUES (?, ?, ?, 1, 1.0, ?, ?, ?)
      `).run(uid(), userId, tag, now, now, categorizeTag(tag));
    }
  }

  // 更新共现关系：同一组标签中的概念之间建立/加强关联
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      linkConcepts(userId, tags[i], tags[j]);
    }
  }
}

function linkConcepts(userId, source, target) {
  const db = getDb();
  if (source === target) return;

  // 双向查找（因为方向不重要）
  const existing = db.prepare(
    'SELECT * FROM concept_links WHERE user_id = ? AND ((source_concept = ? AND target_concept = ?) OR (source_concept = ? AND target_concept = ?))'
  ).get(userId, source, target, target, source);

  if (existing) {
    const newStrength = Math.min(1.0, (existing.association_strength || 0.5) + 0.1);
    db.prepare(`
      UPDATE concept_links SET co_occurrences = co_occurrences + 1, 
      association_strength = ?, last_co_occurrence = datetime('now')
      WHERE id = ?
    `).run(newStrength, existing.id);
  } else {
    db.prepare(`
      INSERT INTO concept_links (id, user_id, source_concept, target_concept, co_occurrences, association_strength)
      VALUES (?, ?, ?, ?, 1, 0.5)
    `).run(uid(), userId, source, target);
  }
}

function categorizeTag(tag) {
  const categories = {
    '财务': ['基金', '股票', '理财', '赚钱', '存钱', '收入', '花钱', '消费', '买'],
    '健康': ['跑步', '运动', '健身', '减肥', '体重', '睡眠', '饮食', '生病', '体检'],
    '工作': ['工作', '运营', '加班', '项目', '客户', '会议', '代运营', '创业', '公司'],
    '学习': ['学习', '读书', '看书', '课程', '考试', '技能', '知识'],
    '情感': ['开心', '难过', '焦虑', '压力', '孤独', '生气', '感动', '期待'],
    '社交': ['朋友', '家人', '聚会', '见面', '社交', '恋爱', '分手'],
  };
  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(k => tag.includes(k))) return cat;
  }
  return '其他';
}

// ===== 概念空间查询 =====

// 获取用户的所有活跃概念
export function getConceptSpace(userId, limit = 50) {
  const db = getDb();
  ensureTables(db);
  return db.prepare(
    'SELECT concept, occurrences, strength, category, last_seen FROM concept_graph WHERE user_id = ? ORDER BY strength DESC LIMIT ?'
  ).all(userId, limit);
}

// 获取与某概念最相关的其他概念
export function getRelatedConcepts(userId, concept, limit = 10) {
  const db = getDb();
  ensureTables(db);
  return db.prepare(`
    SELECT 
      CASE WHEN source_concept = ? THEN target_concept ELSE source_concept END as related_concept,
      co_occurrences, association_strength, last_co_occurrence
    FROM concept_links
    WHERE user_id = ? AND (source_concept = ? OR target_concept = ?)
    ORDER BY association_strength DESC, co_occurrences DESC
    LIMIT ?
  `).all(concept, userId, concept, concept, limit);
}

// 概念联想：从输入标签找到最相关的概念链
export function conceptAssociate(userId, inputTags, depth = 2, limit = 15) {
  const db = getDb();
  ensureTables(db);
  
  const results = new Map();
  
  let currentConcepts = new Set(inputTags);
  
  for (let d = 0; d < depth; d++) {
    const nextConcepts = new Set();
    
    for (const concept of currentConcepts) {
      const related = getRelatedConcepts(userId, concept, 5);
      for (const r of related) {
        const key = r.related_concept;
        // 累积分数：关联强度 * 衰减
        const score = (r.association_strength || 0.5) * Math.pow(0.6, d);
        if (results.has(key)) {
          results.set(key, results.get(key) + score);
        } else {
          results.set(key, score);
        }
        nextConcepts.add(key);
      }
    }
    
    currentConcepts = nextConcepts;
  }

  // 排除输入标签本身
  for (const tag of inputTags) results.delete(tag);

  // 按分数排序
  return [...results.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([concept, score]) => ({ concept, score: Math.round(score * 100) / 100 }));
}

// 概念洞察：分析用户当前的概念空间
export function getConceptInsights(userId) {
  const db = getDb();
  ensureTables(db);

  const concepts = getConceptSpace(userId, 100);
  if (concepts.length === 0) return { totalConcepts: 0, topConcepts: [], insights: ['概念空间尚未建立，需要更多对话数据'] };

  const now = Date.now();
  
  // 最强概念
  const top5 = concepts.slice(0, 5).map(c => c.concept + '(' + c.strength + ')');
  
  // 最近活跃概念
  const recentlyActive = concepts
    .filter(c => (now - new Date(c.last_seen + 'Z').getTime()) < 7 * 86400000)
    .slice(0, 5)
    .map(c => c.concept);

  // 类别分布
  const categories = {};
  for (const c of concepts) {
    categories[c.category] = (categories[c.category] || 0) + 1;
  }

  // 最强关联
  const links = db.prepare(
    'SELECT source_concept, target_concept, association_strength FROM concept_links WHERE user_id = ? ORDER BY association_strength DESC LIMIT 5'
  ).all(userId);
  const topLinks = links.map(l => `${l.source_concept}→${l.target_concept}(${l.association_strength})`);

  let insights = [];
  if (concepts.length < 10) insights.push('概念空间较小，需要更多对话来丰富');
  if (concepts.length > 30) insights.push('概念空间丰富，系统对用户的认知较为全面');
  
  const financeConcepts = concepts.filter(c => c.category === '财务');
  if (financeConcepts.length > 5) insights.push('用户对财务话题关注度高');

  return {
    totalConcepts: concepts.length,
    topConcepts: top5,
    recentlyActive,
    categoryDistribution: categories,
    topLinks,
    insights,
  };
}

// ===== 与旧系统的桥接 =====
// 将动态概念空间的变化反映到用户的 stat_* 维度

export function syncConceptToStats(userId) {
  const db = getDb();
  ensureTables(db);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return;

  const concepts = getConceptSpace(userId, 200);
  
  // 按类别聚合 strength
  const categoryStrength = {};
  for (const c of concepts) {
    categoryStrength[c.category] = (categoryStrength[c.category] || 0) + (c.strength || 1);
  }

  // 归一化到 0-100
  const maxStrength = Math.max(...Object.values(categoryStrength), 1);
  const statMap = {
    '健康': 'stat_health', '工作': 'stat_career', '财务': 'stat_finance',
    '学习': 'stat_learning', '社交': 'stat_social', '情感': 'stat_mental',
  };

  for (const [cat, stat] of Object.entries(statMap)) {
    const val = Math.round((categoryStrength[cat] || 0) / maxStrength * 100);
    try {
      db.prepare(`UPDATE users SET ${stat} = ? WHERE id = ?`).run(Math.min(100, val), userId);
    } catch {}
  }
}
