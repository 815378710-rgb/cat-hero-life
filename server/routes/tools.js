// 猫猫侠工具箱路由 - 搜索/文档/图片
import { Router } from 'express';
import { webSearch, readDocument, buildImageMessage } from '../services/tools-engine.js';
import { chatWithLLM } from '../services/ai-engine.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ===== 网页搜索 =====
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: '缺少搜索词' });
    const results = await webSearch(q);
    res.json({ results: results || [], query: q });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 智能搜索+AI总结
router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: '缺少搜索词' });

    const results = await webSearch(query);
    if (!results || results.length === 0) {
      return res.json({ answer: '未找到相关结果', results: [] });
    }

    // 让AI总结搜索结果
    const context = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\n来源: ${r.url}`).join('\n\n');
    const answer = await chatWithLLM([
      { role: 'system', content: '你是一个搜索助手。基于提供的搜索结果，用简洁的中文回答用户的问题。引用来源时标注编号。' },
      { role: 'user', content: `搜索: ${query}\n\n结果:\n${context}\n\n请基于以上结果回答。` }
    ], { temperature: 0.3, maxTokens: 800 });

    res.json({ answer, results, query });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 文件上传+读取 =====
router.post('/upload-doc', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '没有文件' });

    const result = await readDocument(req.file.buffer, req.file.originalname, req.file.mimetype);
    const db = req.db;
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();

    // 存到记忆系统
    if (user && result.text && result.text.length > 10) {
      db.prepare(
        'INSERT INTO ai_memory (id, user_id, memory_layer, memory_type, title, content, summary, importance, tags, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        user.id, 'long_term', 'document',
        `文档: ${req.file.originalname}`,
        result.text.slice(0, 2000),
        `导入文档 ${req.file.originalname} (${result.type})`,
        6, 'document,imported', 'file-upload'
      );
    }

    res.json({
      filename: req.file.originalname,
      type: result.type,
      size: req.file.size,
      text: result.text.slice(0, 3000),
      stored: !!user
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 图片上传+AI分析 =====
router.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '没有图片' });

    const base64 = req.file.buffer.toString('base64');
    const mime = req.file.mimetype || 'image/jpeg';

    // 调用 vision API（使用 tools-engine 的 buildImageMessage）
    const visionResult = await chatWithLLM([
      buildImageMessage('请用中文描述这张图片的内容。如果是表格/图表请提取数据，如果是文档请归纳要点。', base64, mime)
    ], { temperature: 0.3, maxTokens: 1000 });

    // 存记忆
    const db = req.db;
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (user && visionResult) {
      db.prepare(
        'INSERT INTO ai_memory (id, user_id, memory_layer, memory_type, title, content, summary, importance, tags, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        user.id, 'short_term', 'image',
        `图片: ${req.file.originalname}`,
        visionResult.slice(0, 2000),
        `图片分析: ${visionResult.slice(0, 100)}`,
        5, 'image,analyzed', 'image-upload'
      );
    }

    res.json({
      filename: req.file.originalname,
      analysis: visionResult,
      size: req.file.size
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
