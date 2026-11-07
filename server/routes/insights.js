import { Router } from 'express';
import { v4 as uuid } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const insights = db.prepare(`SELECT ai.*, ld.name as dimension_name, ld.icon as dimension_icon FROM ai_insights ai LEFT JOIN life_dimensions ld ON ai.dimension_id = ld.id WHERE ai.user_id = ? AND ai.is_active = 1 ORDER BY ai.created_at DESC LIMIT 20`).all(user.id);
    res.json({ insights });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/generate', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    // Clear old insights
    db.prepare('UPDATE ai_insights SET is_active = 0 WHERE user_id = ?').run(user.id);
    
    const insights = [];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const dimensions = ['health', 'finance', 'learning', 'career', 'social', 'mental', 'habits', 'creativity'];
    const dimNames = { health: '健康/运动', finance: '财务/理财', learning: '学习/技能', career: '职业/事业', social: '人际关系', mental: '心理/情绪', habits: '习惯养成', creativity: '兴趣/创造' };
    
    for (const dim of dimensions) {
      const recentCheckins = db.prepare('SELECT COUNT(*) as count FROM check_ins WHERE user_id = ? AND dimension_id = ? AND checked_at > ?').get(user.id, dim, weekAgo);
      const statValue = user[`stat_${dim}`];
      
      if (recentCheckins.count === 0 && statValue < 50) {
        insights.push({ type: 'weakness', dimension: dim, title: `${dimNames[dim]}需要关注`, description: `过去一周${dimNames[dim]}维度没有打卡，属性值仅${statValue}。`, confidence: 0.8 });
      }
      if (recentCheckins.count >= 5) {
        insights.push({ type: 'strength', dimension: dim, title: `${dimNames[dim]}表现优秀！`, description: `过去一周打卡${recentCheckins.count}次，继续坚持！🌟`, confidence: 0.9 });
      }
    }
    
    if (user.consecutive_sign_days >= 7) {
      insights.push({ type: 'strength', dimension: null, title: '坚持的力量！', description: `连续签到${user.consecutive_sign_days}天！🔥`, confidence: 1.0 });
    }
    
    const stats = dimensions.map(d => ({ dim: d, value: user[`stat_${d}`] })).sort((a, b) => a.value - b.value);
    if (stats[0].value < 30) {
      insights.push({ type: 'suggestion', dimension: stats[0].dim, title: `建议关注${dimNames[stats[0].dim]}`, description: `${dimNames[stats[0].dim]}属性最低（${stats[0].value}分），建议增加这方面的活动。`, confidence: 0.85 });
    }
    
    const stmt = db.prepare('INSERT INTO ai_insights (id, user_id, insight_type, dimension_id, title, description, confidence, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const i of insights) stmt.run(uuid(), user.id, i.type, i.dimension, i.title, i.description, i.confidence, '{}');
    
    res.json({ success: true, count: insights.length, insights });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/dismiss', (req, res) => {
  const db = req.db;
  try { db.prepare('UPDATE ai_insights SET is_active = 0 WHERE id = ?').run(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
