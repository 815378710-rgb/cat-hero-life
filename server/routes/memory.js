import { Router } from 'express';
import { v4 as uuid } from 'uuid';

const router = Router();

// 获取AI记忆
router.get('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { type, limit, dimension_id } = req.query;
    
    let sql = 'SELECT * FROM ai_memory WHERE user_id = ?';
    const params = [user.id];
    
    if (type) { sql += ' AND memory_type = ?'; params.push(type); }
    if (dimension_id) { sql += ' AND dimension_id = ?'; params.push(dimension_id); }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit) || 30);
    
    res.json({ memories: db.prepare(sql).all(...params) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 添加记忆
router.post('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { memory_type, title, content, summary, dimension_id, emotion_tag, emotion_intensity, importance, source, event_time } = req.body;
    
    const id = uuid();
    db.prepare(`INSERT INTO ai_memory (id, user_id, memory_type, title, content, summary, dimension_id, emotion_tag, emotion_intensity, importance, source, event_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, user.id, memory_type || 'conversation', title, content, summary || content.slice(0, 100), dimension_id, emotion_tag, emotion_intensity || 3, importance || 5, source || 'chat', event_time);
    
    res.json({ success: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取记忆上下文（用于AI对话）
router.get('/context', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    
    // 最近重要记忆
    const importantMemories = db.prepare(`SELECT title, summary, emotion_tag, created_at FROM ai_memory 
      WHERE user_id = ? AND importance >= 7 ORDER BY created_at DESC LIMIT 10`).all(user.id);
    
    // 里程碑记忆
    const milestones = db.prepare(`SELECT title, summary, created_at FROM ai_memory 
      WHERE user_id = ? AND is_milestone = 1 ORDER BY created_at DESC LIMIT 5`).all(user.id);
    
    // 最近情绪趋势
    const recentEmotions = db.prepare(`SELECT emotion_tag, emotion_intensity, created_at FROM ai_memory 
      WHERE user_id = ? AND emotion_tag IS NOT NULL ORDER BY created_at DESC LIMIT 7`).all(user.id);
    
    res.json({ importantMemories, milestones, recentEmotions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取叙事线
router.get('/narrative', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const chapters = db.prepare('SELECT * FROM life_narrative WHERE user_id = ? ORDER BY chapter_number DESC').all(user.id);
    res.json({ chapters });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 添加叙事章节
router.post('/narrative', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const { chapter_title, narrative_text, related_memories, related_achievements, dimension_focus, emotion_arc } = req.body;
    
    // 获取当前最大章节号
    const last = db.prepare('SELECT MAX(chapter_number) as max_ch FROM life_narrative WHERE user_id = ?').get(user.id);
    const nextChapter = (last?.max_ch || 0) + 1;
    
    const id = uuid();
    db.prepare(`INSERT INTO life_narrative (id, user_id, chapter_title, chapter_number, narrative_text, related_memories, related_achievements, dimension_focus, emotion_arc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, user.id, chapter_title, nextChapter, narrative_text, JSON.stringify(related_memories || []), JSON.stringify(related_achievements || []), dimension_focus, emotion_arc);
    
    res.json({ success: true, id, chapter_number: nextChapter });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
