<template>
  <div class="coach-page">
    <div class="page-header">
      <h2>🧠 AI教练</h2>
      <p class="subtitle">基于你的数据，智能分析并给出建议</p>
    </div>

    <div v-if="loading" class="loading">分析中...</div>

    <div v-else-if="advice" class="coach-content">
      <!-- 教练建议 -->
      <div class="advice-card" :class="'priority-' + advice.priority">
        <div class="advice-icon">🐱</div>
        <div class="advice-text">{{ advice.advice }}</div>
      </div>

      <!-- 推荐操作 -->
      <div v-if="advice.actions?.length" class="actions-section">
        <h3>推荐操作</h3>
        <div class="action-list">
          <button v-for="a in advice.actions" :key="a.label" class="action-btn">{{ a.label }}</button>
        </div>
      </div>

      <!-- 统计数据 -->
      <div v-if="advice.stats" class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ advice.stats.todayCheckins }}</div>
          <div class="stat-label">今日打卡</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ advice.stats.weekCheckins }}</div>
          <div class="stat-label">本周打卡</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ advice.stats.incompleteTasks }}</div>
          <div class="stat-label">待办任务</div>
        </div>
        <div class="stat-card" v-if="advice.stats.weakestDimension">
          <div class="stat-value">{{ advice.stats.weakestDimension.value }}</div>
          <div class="stat-label">最弱维度：{{ advice.stats.weakestDimension.name }}</div>
        </div>
      </div>

      <!-- 习惯连锁 -->
      <div v-if="advice.chains?.length" class="chains-section">
        <h3>🔗 习惯连锁分析</h3>
        <div v-for="ch in advice.chains" :key="ch.from + ch.to" class="chain-item">
          <span class="chain-from">{{ ch.from }}</span>
          <span class="chain-arrow">→</span>
          <span class="chain-to">{{ ch.to }}</span>
          <span class="chain-count">（{{ ch.count }}次）</span>
          <div class="chain-desc">{{ ch.description }}</div>
        </div>
      </div>

      <!-- 智能任务推荐 -->
      <div class="smart-tasks-section">
        <h3>💡 智能任务推荐</h3>
        <button class="generate-btn" @click="generateTasks">生成推荐任务</button>
        <div v-if="smartTasks.length" class="task-list">
          <div v-for="(t, i) in smartTasks" :key="i" class="smart-task" :class="'pri-' + t.priority">
            <span class="task-icon">{{ getDimensionIcon(t.dimension) }}</span>
            <div class="task-info">
              <div class="task-title">{{ t.title }}</div>
              <div class="task-reason">{{ t.reason }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty">加载失败，请重试</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const loading = ref(true)
const advice = ref<any>(null)
const smartTasks = ref<any[]>([])

const loadAdvice = async () => {
  loading.value = true
  try {
    const res = await fetch('/api/coach/advice')
    advice.value = await res.json()
  } catch (e) {
    console.error('Failed to load coach advice:', e)
  } finally {
    loading.value = false
  }
}

const generateTasks = async () => {
  try {
    const res = await fetch('/api/coach/smart-tasks?count=3')
    const data = await res.json()
    smartTasks.value = data.tasks || []
  } catch (e) {}
}

const getDimensionIcon = (dim: string) => {
  const icons: Record<string, string> = {
    health: '💪', finance: '💰', learning: '📚', career: '🚀',
    social: '🤝', mental: '🧠', habits: '🔄', creativity: '🎨'
  }
  return icons[dim] || '⭐'
}

onMounted(loadAdvice)
</script>

<style scoped>
.coach-page { max-width: 700px; margin: 0 auto; }
.page-header { margin-bottom: 24px; }
.page-header h2 { font-size: 22px; margin-bottom: 4px; }
.subtitle { color: var(--text-dim); font-size: 13px; }

.advice-card {
  display: flex; gap: 14px; padding: 20px;
  background: var(--bg-card); border-radius: 14px; border: 1px solid var(--border); margin-bottom: 24px;
  white-space: pre-wrap; line-height: 1.7;
}
.advice-card.priority-high { border-left: 4px solid var(--danger); }
.advice-card.priority-medium { border-left: 4px solid var(--warning); }
.advice-icon { font-size: 36px; flex-shrink: 0; }
.advice-text { font-size: 14px; }

.actions-section { margin-bottom: 24px; }
.actions-section h3 { font-size: 15px; margin-bottom: 12px; }
.action-list { display: flex; gap: 8px; flex-wrap: wrap; }
.action-btn {
  padding: 8px 16px; border-radius: 20px; border: 1px solid var(--primary);
  background: transparent; color: var(--primary); cursor: pointer; font-size: 13px; transition: all 0.2s;
}
.action-btn:hover { background: var(--primary); color: white; }

.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
.stat-card {
  background: var(--bg-card); border-radius: 12px; padding: 16px; text-align: center; border: 1px solid var(--border);
}
.stat-value { font-size: 24px; font-weight: 700; color: var(--primary); }
.stat-label { font-size: 11px; color: var(--text-dim); margin-top: 4px; }

.chains-section { margin-bottom: 24px; }
.chains-section h3 { font-size: 15px; margin-bottom: 12px; }
.chain-item {
  background: var(--bg-card); border-radius: 10px; padding: 12px 16px; margin-bottom: 8px; border: 1px solid var(--border);
}
.chain-from, .chain-to { font-weight: 600; }
.chain-arrow { color: var(--primary); margin: 0 6px; }
.chain-count { color: var(--text-dim); font-size: 12px; }
.chain-desc { font-size: 12px; color: var(--text-dim); margin-top: 4px; }

.smart-tasks-section { margin-bottom: 24px; }
.smart-tasks-section h3 { font-size: 15px; margin-bottom: 12px; }
.generate-btn {
  padding: 10px 24px; border-radius: 24px; border: none; background: var(--primary); color: white;
  cursor: pointer; font-size: 14px; margin-bottom: 16px; transition: opacity 0.2s;
}
.generate-btn:hover { opacity: 0.9; }
.smart-task {
  display: flex; gap: 12px; padding: 14px; background: var(--bg-card); border-radius: 10px;
  margin-bottom: 8px; border: 1px solid var(--border);
}
.smart-task.pri-high { border-left: 3px solid var(--danger); }
.smart-task.pri-medium { border-left: 3px solid var(--warning); }
.task-icon { font-size: 22px; }
.task-info { flex: 1; }
.task-title { font-weight: 600; font-size: 14px; }
.task-reason { font-size: 11px; color: var(--text-dim); margin-top: 4px; }

.loading, .empty { text-align: center; padding: 40px; color: var(--text-dim); }

@media (max-width: 768px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
