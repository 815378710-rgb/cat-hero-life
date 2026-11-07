import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { chatWithLLM, isAiEnabled } from '../services/ai-engine.js';

const router = Router();

// 生成成长叙事章节
router.post('/generate', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    const memories = db.prepare('SELECT * FROM ai_memory WHERE user_id = ? ORDER BY created_at DESC LIMIT 15').all(user.id);
    const emotions = db.prepare('SELECT * FROM emotion_logs WHERE user_id = ? ORDER BY log_date DESC LIMIT 7').all(user.id);
    const achievements = db.prepare('SELECT a.name, a.icon FROM user_achievements ua JOIN achievements a ON ua.achievement_id = a.id WHERE ua.user_id = ? ORDER BY ua.unlocked_at DESC LIMIT 5').all(user.id);
    const completedTasks = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE user_id = ? AND status = 'completed'").get(user.id);
    const checkinDays = db.prepare('SELECT COUNT(DISTINCT date(checked_at)) as c FROM check_ins WHERE user_id = ?').get(user.id);
    
    const lastChapter = db.prepare('SELECT MAX(chapter_number) as m FROM life_narrative WHERE user_id = ?').get(user.id);
    const chapterNum = (lastChapter?.m || 0) + 1;
    
    let narrative;
    if (isAiEnabled()) {
      const dimNames = { health:'健康', finance:'财务', learning:'学习', career:'职业', social:'社交', mental:'心理', habits:'习惯', creativity:'创造' };
      const weakest = ['health','finance','learning','career','social','mental','habits','creativity']
        .map(d => ({ dim: d, val: user[`stat_${d}`] }))
        .sort((a, b) => a.val - b.val)[0];
      
      const recentChapters = db.prepare('SELECT chapter_title FROM life_narrative WHERE user_id = ? ORDER BY chapter_number DESC LIMIT 5').all(user.id);
      const avoidTitles = recentChapters.map(c => c.chapter_title).join('、');
      const recentCheckins = db.prepare('SELECT title, dimension_id FROM check_ins WHERE user_id = ? ORDER BY checked_at DESC LIMIT 10').all(user.id);
      const recentCompleted = db.prepare("SELECT title FROM tasks WHERE user_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT 5").all(user.id);
      
      narrative = await chatWithLLM([
        { role: 'system', content: `你是一个人生叙事作家。基于用户的真实数据，写一个小说风格的人生故事章节。

用户：${profile?.gender || ''}，${profile?.birth_year ? new Date().getFullYear() - profile.birth_year : '?'}岁，${profile?.city || ''}，${profile?.current_job || ''}
等级：Lv.${user.level}，连续签到${user.consecutive_sign_days}天
完成任务：${completedTasks.c}个，打卡${checkinDays.c}天
最需要关注的维度：${dimNames[weakest.dim]}（${weakest.val}分）
成就：${achievements.map(a => a.name).join('、') || '暂无'}
最近情绪：${emotions.map(e => e.mood_text).join('→') || '暂无'}
最近记忆：${memories.slice(0, 5).map(m => m.title).join('、') || '暂无'}
最近打卡：${recentCheckins.map(c => c.title).join('、') || '暂无'}
最近完成：${recentCompleted.map(t => t.title).join('、') || '暂无'}

已写过的章节标题（请避免重复）：${avoidTitles || '暂无'}

第${chapterNum}章，标题自拟，必须跟之前不同。
写200-300字，小说风格，第三人称。要有情感、有具体细节（用真实数据）、有悬念。
每章要有不同的主题和情绪，不要重复。不要用Markdown格式，纯文本。` },
        { role: 'user', content: '写第' + chapterNum + '章' }
      ], { temperature: 0.95, maxTokens: 500 });
    }
    
    if (!narrative) {
      const name = user.username || '主角';
      const age = profile?.birth_year ? new Date().getFullYear() - profile.birth_year : 25;
      narrative = `第${chapterNum}章：继续前行\n\n${age}岁的${name}又度过了平凡的一天。\n\n完成任务${completedTasks.c}个，打卡${checkinDays.c}天。数字在增长，但${name}知道，真正的变化不在于数字。\n\n属性面板上，${['健康','财务','学习','职业','社交','心理','习惯','创造'].sort((a,b) => user['stat_'+{健康:'health',财务:'finance',学习:'learning',职业:'career',社交:'social',心理:'mental',习惯:'habits',创造:'creativity'}[a]] - user['stat_'+{健康:'health',财务:'finance',学习:'learning',职业:'career',社交:'social',心理:'mental',习惯:'habits',创造:'creativity'}[b]])[0]}维度最低，这是下一个需要突破的方向。\n\n猫猫侠在屏幕的另一端注视着这一切。它知道，每一个小进步，都在编织一个更大的故事。\n\n而这个故事，才刚刚开始。`;
    }
    
    const title = narrative.match(/第\d+章[：:](.+)/)?.[1]?.trim() || `第${chapterNum}章`;
    
    const id = uuid();
    db.prepare("INSERT INTO life_narrative (id, user_id, chapter_title, chapter_number, narrative_text) VALUES (?, ?, ?, ?, ?)")
      .run(id, user.id, title, chapterNum, narrative);
    
    db.prepare("INSERT INTO ai_memory (id, user_id, memory_type, title, content, summary, importance, is_milestone, source) VALUES (?, ?, 'milestone', ?, ?, ?, 7, 1, 'narrative')")
      .run(uuid(), user.id, `叙事：${title}`, narrative.slice(0, 200), `第${chapterNum}章生成`);
    
    res.json({ success: true, chapter: { id, chapter_number: chapterNum, chapter_title: title, narrative_text: narrative } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 获取所有章节
router.get('/chapters', (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    const chapters = db.prepare('SELECT * FROM life_narrative WHERE user_id = ? ORDER BY chapter_number DESC').all(user.id);
    res.json({ chapters });
  } catch (e) { res.json({ chapters: [] }); }
});

export default router;
