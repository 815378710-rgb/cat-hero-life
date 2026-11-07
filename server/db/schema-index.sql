-- 猫猫侠数据库索引优化
-- 提升查询性能

-- ==========================================
-- 用户相关索引
-- ==========================================

-- users表
CREATE INDEX IF NOT EXISTS idx_users_level ON users(level);
CREATE INDEX IF NOT EXISTS idx_users_last_sign ON users(last_sign_date);

-- ==========================================
-- 任务系统索引
-- ==========================================

-- tasks表（最频繁查询的表）
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, scheduled_date);

-- ==========================================
-- 打卡系统索引
-- ==========================================

-- check_ins表
CREATE INDEX IF NOT EXISTS idx_checkins_user ON check_ins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON check_ins(checked_at);
CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON check_ins(user_id, date(checked_at));

-- ==========================================
-- 习惯系统索引
-- ==========================================

-- habits表
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_habits_active ON habits(user_id, is_active);

-- habit_logs表
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs(habit_id);
CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(logged_at);

-- ==========================================
-- 聊天历史索引
-- ==========================================

-- chat_history表
CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created ON chat_history(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_role ON chat_history(user_id, role);

-- ==========================================
-- 人生规划索引
-- ==========================================

-- life_plans表
CREATE INDEX IF NOT EXISTS idx_plans_user ON life_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_plans_status ON life_plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_user_status ON life_plans(user_id, status);

-- ==========================================
-- 健康数据索引
-- ==========================================

-- health_sleep表
CREATE INDEX IF NOT EXISTS idx_sleep_user ON health_sleep(user_id);
CREATE INDEX IF NOT EXISTS idx_sleep_date ON health_sleep(sleep_date);

-- health_exercise表
CREATE INDEX IF NOT EXISTS idx_exercise_user ON health_exercise(user_id);
CREATE INDEX IF NOT EXISTS idx_exercise_date ON health_exercise(exercise_date);

-- health_body表
CREATE INDEX IF NOT EXISTS idx_body_user ON health_body(user_id);
CREATE INDEX IF NOT EXISTS idx_body_date ON health_body(record_date);

-- ==========================================
-- 财务数据索引
-- ==========================================

-- finance_transactions表
CREATE INDEX IF NOT EXISTS idx_transactions_user ON finance_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON finance_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON finance_transactions(type);

-- ==========================================
-- 学习数据索引
-- ==========================================

-- learning_skills表
CREATE INDEX IF NOT EXISTS idx_skills_user ON learning_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_skills_learning ON learning_skills(user_id, is_learning);

-- ==========================================
-- 记忆系统索引
-- ==========================================

-- ai_memory表
CREATE INDEX IF NOT EXISTS idx_memory_user ON ai_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_importance ON ai_memory(importance);
CREATE INDEX IF NOT EXISTS idx_memory_milestone ON ai_memory(is_milestone);
CREATE INDEX IF NOT EXISTS idx_memory_created ON ai_memory(created_at);

-- ==========================================
-- 情绪日志索引
-- ==========================================

-- emotion_logs表
CREATE INDEX IF NOT EXISTS idx_emotion_user ON emotion_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_emotion_date ON emotion_logs(log_date);

-- mental_mood_diary表
CREATE INDEX IF NOT EXISTS idx_mood_user ON mental_mood_diary(user_id);
CREATE INDEX IF NOT EXISTS idx_mood_date ON mental_mood_diary(diary_date);

-- ==========================================
-- 成就系统索引
-- ==========================================

-- user_achievements表
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked ON user_achievements(user_id, achievement_id);

-- ==========================================
-- 增长型时序表索引（2026-11 补充）
-- ==========================================
-- 这些表随使用持续增长，此前全部无索引、全表扫描。
-- dimension_history 已达 8.9 万行，是首页与维度接口的主要查询源。

-- dimension_history：WHERE user_id=? ORDER BY recorded_at DESC
--                    WHERE user_id=? AND dimension=? ORDER BY recorded_at DESC
CREATE INDEX IF NOT EXISTS idx_dim_history_user_time ON dimension_history(user_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_dim_history_user_dim_time ON dimension_history(user_id, dimension, recorded_at);

-- energy_log：WHERE user_id=? AND created_at >= ?
--             WHERE user_id=? AND log_date=?
CREATE INDEX IF NOT EXISTS idx_energy_user_created ON energy_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_energy_user_date ON energy_log(user_id, log_date);

-- balance_snapshots：WHERE user_id=? ORDER BY snapshot_date DESC
CREATE INDEX IF NOT EXISTS idx_balance_user_date ON balance_snapshots(user_id, snapshot_date);

-- propagation_log：WHERE user_id=? [AND created_at>=?] ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_propagation_user_created ON propagation_log(user_id, created_at);

-- pending_wechat_msgs：WHERE user_id=? AND status=? / created_at>=
CREATE INDEX IF NOT EXISTS idx_pending_msg_user_status ON pending_wechat_msgs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_msg_user_created ON pending_wechat_msgs(user_id, created_at);

-- quest_steps：WHERE chain_id=? ORDER BY step_number
CREATE INDEX IF NOT EXISTS idx_quest_steps_chain ON quest_steps(chain_id, step_number);

-- notification_log：WHERE user_id=? [AND opened_at IS NOT NULL] ORDER BY sent_at DESC
CREATE INDEX IF NOT EXISTS idx_notification_user_sent ON notification_log(user_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_notification_user_opened ON notification_log(user_id, opened_at);

-- ==========================================
-- 优化完成
-- ==========================================
-- 以上索引将显著提升以下查询的性能：
-- 1. 用户数据加载（tasks, check_ins, habits等）
-- 2. 日期范围查询（本周/本月统计）
-- 3. 状态过滤（活跃任务/完成目标等）
-- 4. 聊天历史加载
-- 5. 记忆系统查询（重要性过滤）
