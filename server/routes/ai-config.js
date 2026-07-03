import { Router } from 'express';
import { setAiConfig, getAiConfig, isAiEnabled } from '../services/ai-engine.js';

const router = Router();

router.get('/config', (req, res) => {
  res.json({ config: getAiConfig(), enabled: isAiEnabled() });
});

router.put('/config', (req, res) => {
  const db = req.db;
  try {
    let { provider, apiKey, model } = req.body;
    
    // 清理API Key
    if (apiKey) {
      apiKey = apiKey.replace(/[^\x20-\x7E]/g, '').trim().replace(/^["']|["']$/g, '');
    }
    
    // Save to database
    db.prepare('DELETE FROM ai_config').run();
    db.prepare('INSERT INTO ai_config (provider, api_key, model) VALUES (?, ?, ?)').run(provider, apiKey, model);
    
    // Update runtime config
    setAiConfig({ provider, apiKey, model });
    
    res.json({ success: true, config: getAiConfig() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
