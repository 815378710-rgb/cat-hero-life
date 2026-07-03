<template>
  <div class="dashboard">
    <!-- Onboarding Banner -->
    <div v-if="userStore.needsOnboarding" class="onboarding-banner">
      <div class="banner-content">
        <div class="banner-icon">🐱</div>
        <div class="banner-text">
          <h3>欢迎来到猫猫侠人生管理系统！</h3>
          <p>先让我了解你，然后为你制定专属的人生规划~</p>
        </div>
        <button class="btn btn-primary" @click="$router.push('/onboarding')">开始建档 →</button>
      </div>
    </div>

    <!-- Status Bar -->
    <div class="status-bar">
      <div class="status-item energy" :style="{ color: energyColor }">
        ⚡ {{ energyValue }} {{ energyLabel }}
      </div>
      <div v-if="weather" class="status-item weather">
        🌤️ {{ weather.temp }}°C {{ weather.description }}
      </div>
      <div class="status-item mood">
        {{ moodEmoji }} {{ moodDesc }}
      </div>
    </div>

    <!-- Welcome Banner -->
    <div class="welcome-banner">
      <div class="welcome-text">
        <h2>🐱 {{ userStore.username }}，{{ greeting }}！</h2>
        <p>Lv.{{ userStore.level }} · 连续签到{{ userStore.streak }}天 · 今日已打卡{{ todayCheckins }}次</p>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: userStore.expProgress + '%' }"></div>
        </div>
        <span class="exp-text">{{ userStore.user?.exp || 0 }} / {{ expForNext }} EXP</span>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stat-cards">
      <div class="stat-card" @click="$router.push('/tasks')">
        <div class="stat-icon">📋</div>
        <div class="stat-value">{{ pendingTasks }}</div>
        <div class="stat-label">今日任务</div>
      </div>
      <div class="stat-card" @click="$router.push('/checkin')">
        <div class="stat-icon">✅</div>
        <div class="stat-value">{{ todayCheckins }}</div>
        <div class="stat-label">今日打卡</div>
      </div>
      <div class="stat-card" @click="$router.push('/character')">
        <div class="stat-icon">⭐</div>
        <div class="stat-value">Lv.{{ userStore.level }}</div>
        <div class="stat-label">当前等级</div>
      </div>
      <div class="stat-card" @click="$router.push('/shop')">
        <div class="stat-icon">🪙</div>
        <div class="stat-value">{{ userStore.coins }}</div>
        <div class="stat-label">金币</div>
      </div>
    </div>

    <!-- Two Column Layout -->
    <div class="grid-2">
      <!-- Dimension Stats -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">📊 人生属性</div>
          <button class="btn btn-sm btn-secondary" @click="$router.push('/character')">详情</button>
        </div>
        <div class="dimension-grid">
          <div v-for="dim in dimensions" :key="dim.id" class="dimension-card">
            <div class="dim-icon">{{ dim.icon }}</div>
            <div class="dim-name">{{ dim.name }}</div>
            <div class="dim-value" :style="{ color: dim.color }">{{ dim.value }}</div>
            <div class="dim-bar">
              <div class="dim-bar-fill" :style="{ width: dim.value + '%', background: dim.color }"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Today's Tasks -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">📝 今日任务</div>
          <button class="btn btn-sm btn-primary" @click="generateTasks">生成任务</button>
        </div>
        <div v-if="todayTasks.length === 0" class="empty-state">
          还没有今日任务，点击生成~
        </div>
        <div v-for="task in todayTasks.slice(0, 5)" :key="task.id" class="task-item" :class="{ completed: task.status === 'completed' }">
          <div class="task-check" :class="{ done: task.status === 'completed' }" @click="completeTask(task.id)">
            {{ task.status === 'completed' ? '✓' : '' }}
          </div>
          <div class="task-content">
            <div class="task-title">{{ task.dimension_icon }} {{ task.title }}</div>
            <div class="task-meta">
              <span class="badge" :class="'badge-' + task.difficulty">{{ task.difficulty }}</span>
              <span>+{{ task.exp_reward }}EXP +{{ task.coin_reward }}🪙</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Achievements -->
    <div v-if="recentAchievements.length > 0" class="card">
      <div class="card-header">
        <div class="card-title">🏆 最近成就</div>
      </div>
      <div class="achievement-row">
        <div v-for="ach in recentAchievements" :key="ach.id" class="achievement-mini">
          <div class="ach-icon">{{ ach.icon }}</div>
          <div class="ach-name">{{ ach.name }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { dashboardApi, taskApi, gamificationApi } from '@/api'
import type { Task, Achievement } from '@/types'

const userStore = useUserStore()

const todayTasks = ref<Task[]>([])
const todayCheckins = ref(0)
const recentAchievements = ref<Achievement[]>([])
const pendingTasks = ref(0)
const weather = ref<any>(null)
const energyValue = ref(50)
const energyLabel = ref('一般状态')
const energyColor = ref('#FF9800')
const moodEmoji = ref('🐱')
const moodDesc = ref('还好~')

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  if (h < 22) return '晚上好'
  return '夜深了'
})

const expForNext = computed(() => {
  const level = userStore.level
  return Math.floor(100 * Math.pow(1.15, level))
})

const dimensions = computed(() => {
  const s = userStore.stats
  return [
    { id: 'health', name: '健康', icon: '🏋️', color: '#FF6B6B', value: s.health || 0 },
    { id: 'finance', name: '财务', icon: '💰', color: '#4ECDC4', value: s.finance || 0 },
    { id: 'learning', name: '学习', icon: '📚', color: '#45B7D1', value: s.learning || 0 },
    { id: 'career', name: '职业', icon: '💼', color: '#96CEB4', value: s.career || 0 },
    { id: 'social', name: '社交', icon: '❤️', color: '#FFEAA7', value: s.social || 0 },
    { id: 'mental', name: '心理', icon: '🧘', color: '#DDA0DD', value: s.mental || 0 },
    { id: 'habits', name: '习惯', icon: '🎯', color: '#F0E68C', value: s.habits || 0 },
    { id: 'creativity', name: '创造', icon: '🎨', color: '#FFB347', value: s.creativity || 0 },
  ]
})

const loadDashboard = async () => {
  try {
    const data = await dashboardApi.getDashboard()
    todayTasks.value = data.todayTasks || []
    todayCheckins.value = data.todayCheckins || 0
    recentAchievements.value = data.recentAchievements || []
    pendingTasks.value = todayTasks.value.filter(t => t.status === 'pending').length
  } catch (e) {
    console.error('Failed to load dashboard:', e)
  }
}

const generateTasks = async () => {
  const res = await taskApi.generateSmart()
  if (res.success) {
    await loadDashboard()
  }
}

const completeTask = async (id: string) => {
  const res = await taskApi.completeTask(id)
  if (res.success) {
    await loadDashboard()
    await userStore.fetchUser()
  }
}

onMounted(loadDashboard)
</script>

<style scoped>
.dashboard { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.onboarding-banner {
  background: linear-gradient(135deg, rgba(255,107,157,0.1), rgba(78,205,196,0.1));
  border: 1px solid rgba(255,107,157,0.2);
  border-radius: 12px; padding: 20px; margin-bottom: 16px;
}
.banner-content { display: flex; align-items: center; gap: 16px; }
.banner-icon { font-size: 48px; }
.banner-text { flex: 1; }
.banner-text h3 { margin-bottom: 4px; }
.banner-text p { color: var(--text-dim); font-size: 14px; }

.status-bar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.status-item {
  padding: 8px 16px; border-radius: 20px; font-size: 13px;
  background: var(--bg-card); border: 1px solid var(--border);
}

.welcome-banner {
  background: linear-gradient(135deg, rgba(255,107,157,0.15), rgba(78,205,196,0.15));
  border-radius: 12px; padding: 24px; margin-bottom: 20px;
  border: 1px solid rgba(255,107,157,0.2);
}
.welcome-text h2 { font-size: 22px; margin-bottom: 8px; }
.welcome-text p { color: var(--text-dim); font-size: 14px; }
.exp-text { font-size: 12px; color: var(--text-dim); }

.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
.stat-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 12px; padding: 16px; text-align: center;
  cursor: pointer; transition: all 0.2s;
}
.stat-card:hover { border-color: var(--primary); transform: translateY(-2px); }
.stat-icon { font-size: 24px; margin-bottom: 8px; }
.stat-value { font-size: 24px; font-weight: 700; }
.stat-label { font-size: 11px; color: var(--text-dim); margin-top: 4px; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 12px; padding: 20px; margin-bottom: 16px;
}
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.card-title { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 8px; }

.dimension-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.dimension-card { text-align: center; }
.dim-icon { font-size: 24px; margin-bottom: 4px; }
.dim-name { font-size: 11px; color: var(--text-dim); margin-bottom: 4px; }
.dim-value { font-size: 16px; font-weight: 700; }
.dim-bar { width: 100%; height: 4px; background: var(--bg-input); border-radius: 2px; margin-top: 6px; overflow: hidden; }
.dim-bar-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }

.task-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.task-item.completed { opacity: 0.6; }
.task-item.completed .task-title { text-decoration: line-through; }
.task-check {
  width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.2s; flex-shrink: 0; font-size: 12px;
}
.task-check:hover { border-color: var(--success); background: rgba(76,175,80,0.2); }
.task-check.done { background: var(--success); border-color: var(--success); color: white; }
.task-content { flex: 1; }
.task-title { font-size: 14px; font-weight: 500; }
.task-meta { font-size: 11px; color: var(--text-dim); margin-top: 4px; display: flex; gap: 8px; }

.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; }
.badge-easy { background: rgba(76,175,80,0.2); color: var(--success); }
.badge-medium { background: rgba(255,152,0,0.2); color: var(--warning); }
.badge-hard { background: rgba(244,67,54,0.2); color: var(--danger); }

.achievement-row { display: flex; gap: 16px; overflow-x: auto; }
.achievement-mini { text-align: center; min-width: 80px; }
.achievement-mini .ach-icon { font-size: 28px; }
.achievement-mini .ach-name { font-size: 11px; margin-top: 4px; }

.empty-state { text-align: center; padding: 30px; color: var(--text-dim); }

.progress-bar { width: 100%; max-width: 300px; height: 8px; background: var(--bg-input); border-radius: 4px; margin: 8px 0; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 4px; transition: width 0.5s; background: linear-gradient(90deg, var(--primary), var(--secondary)); }

.btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px; }
.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-dark); }
.btn-secondary { background: var(--bg-card-hover); color: var(--text); border: 1px solid var(--border); }
.btn-sm { padding: 6px 12px; font-size: 12px; }

@media (max-width: 768px) {
  .grid-2 { grid-template-columns: 1fr; }
  .stat-cards { grid-template-columns: repeat(2, 1fr); }
  .dimension-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
