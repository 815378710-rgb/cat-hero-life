import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { chatWithLLM, isAiEnabled } from '../services/ai-engine.js';

const router = Router();

// 创建目标并自动拆解成任务链
router.post('/create-with-plan', async (req, res) => {
  const db = req.db;
  try {
    const user = db.prepare('SELECT * FROM users LIMIT 1').get();
    const profile = db.prepare('SELECT * FROM life_profile WHERE user_id = ?').get(user.id);
    const { title, description, dimension_id, target_value, unit, deadline, priority } = req.body;
    
    if (!title) return res.status(400).json({ error: '请输入目标名称' });
    
    // 创建目标
    const goalId = uuid();
    db.prepare(`INSERT INTO goals (id, user_id, dimension_id, title, description, target_value, unit, deadline, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(goalId, user.id, dimension_id || 'habits', title, description || null, target_value || null, unit || null, deadline || null, priority || 'medium');
    
    // 用LLM拆解成任务链
    let taskPlan = null;
    if (isAiEnabled()) {
      taskPlan = await decomposeGoalWithLLM(title, description, dimension_id, target_value, unit, deadline, profile, user);
    }
    
    if (!taskPlan) {
      taskPlan = generateDefaultPlan(title, dimension_id, deadline);
    }
    
    // 保存任务链
    const stmt = db.prepare(`INSERT INTO tasks (id, user_id, goal_id, dimension_id, title, description, task_type, difficulty, exp_reward, coin_reward, scheduled_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    
    const today = new Date();
    for (let i = 0; i < taskPlan.length; i++) {
      const task = taskPlan[i];
      const scheduledDate = new Date(today.getTime() + task.dayOffset * 86400000).toISOString().split('T')[0];
      stmt.run(uuid(), user.id, goalId, dimension_id || 'habits', task.title, task.description, task.type || 'daily', task.difficulty || 'medium', task.exp || 20, task.coins || 10, scheduledDate);
    }
    
    // 记录记忆
    db.prepare("INSERT INTO ai_memory (id, user_id, memory_type, title, content, summary, dimension_id, importance, source) VALUES (?, ?, 'decision', ?, ?, ?, ?, 7, 'goal')")
      .run(uuid(), user.id, `创建目标: ${title}`, `用户创建了目标"${title}"，已拆解为${taskPlan.length}个任务`, `目标"${title}"已创建并拆解`, dimension_id);
    
    res.json({ 
      success: true, 
      goalId, 
      taskCount: taskPlan.length, 
      tasks: taskPlan,
      message: `目标"${title}"已创建，拆解为${taskPlan.length}个任务~ 🎯` 
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 查看目标的任务链
router.get('/:id/tasks', (req, res) => {
  const db = req.db;
  try {
    const tasks = db.prepare(`
      SELECT t.*, ld.name as dimension_name, ld.icon as dimension_icon 
      FROM tasks t LEFT JOIN life_dimensions ld ON t.dimension_id = ld.id 
      WHERE t.goal_id = ? ORDER BY t.scheduled_date ASC
    `).all(req.params.id);
    
    const completed = tasks.filter(t => t.status === 'completed').length;
    const total = tasks.length;
    
    res.json({ tasks, completed, total, progress: total > 0 ? Math.round(completed / total * 100) : 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 目标进度更新+自动调整后续任务
router.put('/:id/adjust', async (req, res) => {
  const db = req.db;
  try {
    const { reason } = req.body;
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
    if (!goal) return res.status(404).json({ error: '目标不存在' });
    
    const pendingTasks = db.prepare("SELECT * FROM tasks WHERE goal_id = ? AND status = 'pending' ORDER BY scheduled_date ASC").all(goal.id);
    
    // 用LLM调整计划
    if (isAiEnabled() && pendingTasks.length > 0) {
      const adjusted = await adjustPlanWithLLM(goal, pendingTasks, reason);
      if (adjusted) {
        const stmt = db.prepare('UPDATE tasks SET title = ?, description = ?, scheduled_date = ? WHERE id = ?');
        for (const task of adjusted) {
          if (task.id && task.newDate) {
            stmt.run(task.title || '', task.description || '', task.newDate, task.id);
          }
        }
      }
    }
    
    res.json({ success: true, message: '计划已调整~ 📋' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function decomposeGoalWithLLM(title, description, dimension, targetValue, unit, deadline, profile, user) {
  try {
    const daysUntilDeadline = deadline ? Math.ceil((new Date(deadline) - new Date()) / 86400000) : 30;
    
    const prompt = `你是一个人生规划引擎。用户设定了一个目标，请将其拆解为具体的每日/每周任务。

【目标信息】
- 目标：${title}
- 描述：${description || '无'}
- 维度：${dimension || '综合'}
- 目标值：${targetValue || '未设定'}${unit || ''}
- 截止日期：${deadline || '未设定'}（距今${daysUntilDeadline}天）

【用户背景】
- 职业：${profile?.current_job || '未知'}
- 性格：${safeJoin(profile?.personality_traits)}
- 当前挑战：${safeJoin(profile?.current_challenges)}

请生成任务计划，JSON数组格式：
[
  {"dayOffset": 0, "title": "任务标题", "description": "具体怎么做", "type": "daily/weekly", "difficulty": "easy/medium/hard", "exp": 20, "coins": 10}
]

要求：
1. 从今天开始，每天1-2个任务
2. 任务要具体可执行
3. 难度循序渐进
4. 总任务数控制在${Math.min(daysUntilDeadline, 30)}个以内
5. 每个任务都要跟目标直接相关

只返回JSON数组。`;

    const response = await chatWithLLM([
      { role: 'system', content: prompt },
      { role: 'user', content: `请为"${title}"生成任务计划` }
    ], { temperature: 0.8, maxTokens: 2000 });
    
    if (response) {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
  } catch (e) {
    console.error('LLM目标拆解失败:', e.message);
  }
  return null;
}

async function adjustPlanWithLLM(goal, pendingTasks, reason) {
  try {
    const prompt = `用户的目标"${goal.title}"的执行计划需要调整。

原因：${reason || '进度落后'}

待完成任务：
${pendingTasks.map((t, i) => `${i+1}. ${t.title} (${t.scheduled_date})`).join('\n')}

请返回调整后的任务，JSON数组格式：
[{"id": "任务ID", "title": "新标题", "description": "新描述", "newDate": "新日期YYYY-MM-DD"}]

只返回需要调整的任务。只返回JSON。`;

    const response = await chatWithLLM([
      { role: 'system', content: prompt },
      { role: 'user', content: '请调整计划' }
    ], { temperature: 0.7, maxTokens: 1500 });
    
    if (response) {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    }
  } catch {}
  return null;
}

function generateDefaultPlan(title, dimension, deadline) {
  const days = deadline ? Math.min(Math.ceil((new Date(deadline) - new Date()) / 86400000), 30) : 14;
  const plan = [];
  for (let i = 0; i < Math.min(days, 10); i++) {
    plan.push({
      dayOffset: i,
      title: `${title} - 第${i + 1}步`,
      description: `推进"${title}"的第${i + 1}步`,
      type: 'daily',
      difficulty: i < 3 ? 'easy' : i < 7 ? 'medium' : 'hard',
      exp: 15 + i * 2,
      coins: 8 + i
    });
  }
  return plan;
}

function safeJoin(jsonStr) {
  try { const arr = JSON.parse(jsonStr); return Array.isArray(arr) ? arr.join('、') : ''; } catch { return ''; }
}

export default router;
