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

    <!-- RPG Event Banner -->
    <div v-if="randomEvent" class="event-banner" :style="{ borderColor: randomEvent.color || 'var(--primary)' }">
      <div class="event-icon">{{ randomEvent.icon || '🎲' }}</div>
      <div class="event-body">
        <div class="event-title">{{ randomEvent.title }}</div>
        <div class="event-desc">{{ randomEvent.description }}</div>
        <div class="event-choices">
          <button v-for="(c, i) in (randomEvent.choices||[])" :key="c.text" class="event-btn" @click="handleEvent(i)">{{ c.text }}</button>
        </div>
      </div>
    </div>

    <!-- Status Bar -->
    <div class="status-bar">
      <div class="status-item energy" :style="{ color: energyColor }">⚡ {{ energyValue }} {{ energyLabel }}</div>
      <div v-if="weather" class="status-item weather">🌤️ {{ weather.temp }}°C {{ weather.description }}</div>
      <div class="status-item mood">{{ moodEmoji }} {{ moodDesc }}</div>
    </div>

    <!-- Welcome Banner -->
    <div class="welcome-banner">
      <div class="welcome-text">
        <h2>🐱 {{ userStore.username }}，{{ greeting }}！</h2>
        <p>Lv.{{ userStore.level }} · 连续签到{{ userStore.streak }}天 · 今日已打卡{{ todayCheckins }}次</p>
        <div class="progress-bar"><div class="progress-fill" :style="{ width: userStore.expProgress + '%' }"></div></div>
        <span class="exp-text">{{ userStore.user?.exp || 0 }} / {{ expForNext }} EXP</span>
      </div>
    </div>

    <!-- Loading -->
    <template v-if="loading">
      <div class="stat-cards"><Skeleton v-for="i in 6" :key="i" type="card" height="100px" /></div>
    </template>

    <template v-else>
      <!-- Stats Grid -->
      <div class="stat-cards">
        <div class="stat-card" @click="$router.push('/tasks')">
          <div class="stat-icon">📋</div><div class="stat-value">{{ pendingTasks }}</div><div class="stat-label">今日任务</div>
        </div>
        <div class="stat-card" @click="$router.push('/checkin')">
          <div class="stat-icon">✅</div><div class="stat-value">{{ todayCheckins }}</div><div class="stat-label">今日打卡</div>
        </div>
        <div class="stat-card" @click="$router.push('/character')">
          <div class="stat-icon">⭐</div><div class="stat-value">Lv.{{ userStore.level }}</div><div class="stat-label">当前等级</div>
        </div>
        <div class="stat-card" @click="$router.push('/shop')">
          <div class="stat-icon">🪙</div><div class="stat-value">{{ userStore.coins }}</div><div class="stat-label">金币</div>
        </div>
        <div class="stat-card" v-if="financeData">
          <div class="stat-icon">💰</div>
          <div class="stat-value" :class="financeData.today_income > financeData.today_expense ? 'positive' : 'negative'">
            ¥{{ Math.abs(financeData.today_income - financeData.today_expense).toFixed(0) }}
          </div>
          <div class="stat-label">今日净收支</div>
        </div>
        <div class="stat-card" v-if="aiInsight">
          <div class="stat-icon">💡</div>
          <div class="stat-value small">{{ aiInsight.weakIcon }} {{ aiInsight.weakDimension }}</div>
          <div class="stat-label">最需关注维度</div>
        </div>
      </div>

      <!-- AI Insight Banner -->
      <div v-if="aiInsight" class="insight-banner">
        <div class="insight-icon">🧠</div>
        <div class="insight-text">
          <strong>AI洞见：</strong>最近7天你<span v-if="aiInsight.mood !== 'neutral'">的{{ emotionMap[aiInsight.mood] || aiInsight.mood }}情绪较多</span><span v-if="aiInsight.weakDimension">，「{{ aiInsight.weakDimension }}」维度打卡最少，建议多加关注</span>。
        </div>
        <button class="btn btn-sm" @click="$router.push('/insights')">查看详情 →</button>
      </div>

      <!-- Weekly Review Card -->
      <div class="card report-card">
        <h3>📊 本周复盘</h3>
        <div v-if="weeklyReview">
          <p class="review-text">{{ (weeklyReview.summary || '').slice(0, 120) || '暂无复盘' }}</p>
          <div class="review-stats">
            <span>✅ {{ weeklyReview.tasksCompleted || 0 }} 任务</span>
            <span>🔥 {{ weeklyReview.checkins || 0 }} 打卡</span>
          </div>
        </div>
        <p v-else class="empty-hint">本周暂无数据</p>
        <div class="review-actions">
          <button class="btn-small" @click="loadWeeklyReview" :disabled="reviewLoading">
            {{ reviewLoading ? '生成中...' : '刷新周报' }}
          </button>
        </div>
      </div>

      <!-- Two Column Layout -->
      <div class="grid-2">
        <div class="card">
          <div class="card-header"><div class="card-title">📊 人生属性</div></div>

          <!-- 空状态引导：用户尚未在任何维度打卡，避免"看起来像没数据" -->
          <div v-if="allEmpty" class="dimension-empty">
            <div class="de-emoji">🐱</div>
            <div class="de-title">你的人生画卷还是空白的～</div>
            <div class="de-desc">点击任意维度完成<strong>第一次打卡</strong>，猫猫侠就会开始追踪你的成长轨迹，人生属性也会逐渐点亮！</div>
            <button class="btn btn-primary de-btn" @click="startFirstCheckin">🚀 开始第一次打卡</button>
            <div class="de-hint">共 {{ dimensionStats.length }} 个人生维度等你探索</div>
          </div>

          <div v-else class="dimension-list">
            <div v-for="dim in dimensionStats" :key="dim.id" class="dimension-item" :class="{ 'dim-inactive': dim.total_checkins === 0 }" @click="handleDimensionClick(dim)">
              <div class="dim-icon">{{ dim.icon }}</div>
              <div class="dim-info">
                <div class="dim-name">
                  {{ dim.name }}
                  <span v-if="dim.total_checkins === 0" class="dim-tag">未开始</span>
                </div>
                <div class="dim-bar">
                  <div class="dim-fill" :class="{ 'dim-fill-empty': dim.total_checkins === 0 }" :style="{ width: (dim.total_checkins === 0 ? 0 : dim.score) + '%', background: dim.color }"></div>
                </div>
              </div>
              <div class="dim-value">{{ dim.total_checkins === 0 ? '—' : (dim.score || 0) }}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">📋 今日任务</div>
            <button class="btn btn-sm" @click="$router.push('/tasks')">全部 →</button>
          </div>
          <div v-if="todayTasks?.length" class="task-list">
            <div v-for="t in todayTasks.slice(0, 5)" :key="t.id" class="task-item" :class="{ done: t.status === 'completed' }">
              <div class="task-status" @click="toggleTask(t)">{{ t.status === 'completed' ? '✅' : '⬜' }}</div>
              <div class="task-info">
                <div class="task-title">{{ t.title }}</div>
                <div class="task-meta" v-if="t.dimension_name">
                  <span :style="{ color: t.dimension_color }">{{ t.dimension_icon }} {{ t.dimension_name }}</span>
                  <span>+{{ t.exp_reward || 10 }}EXP</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="empty-state">🎉 今天没有任务！</div>
        </div>
      </div>

      <!-- Finance Summary -->
      <div v-if="financeData" class="card finance-card">
        <div class="card-header">
          <div class="card-title">💰 财务快照（土豆记账）</div>
          <button class="btn btn-sm" @click="openFinance">查看详情 →</button>
        </div>
        <div class="finance-grid">
          <div class="finance-item">
            <div class="finance-label">今日收入</div>
            <div class="finance-value income">¥{{ financeData.today_income.toFixed(0) }}</div>
          </div>
          <div class="finance-item">
            <div class="finance-label">今日支出</div>
            <div class="finance-value expense">¥{{ financeData.today_expense.toFixed(0) }}</div>
          </div>
          <div class="finance-item">
            <div class="finance-label">本月收入</div>
            <div class="finance-value income">¥{{ financeData.month_income.toFixed(0) }}</div>
          </div>
          <div class="finance-item">
            <div class="finance-label">本月支出</div>
            <div class="finance-value expense">¥{{ financeData.month_expense.toFixed(0) }}</div>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="card quick-actions">
        <div class="card-header"><div class="card-title">⚡ 快捷操作</div></div>
        <div class="action-grid">
          <button class="action-btn" @click="generateSmartTasks">🤖 智能生成任务</button>
          <button class="action-btn" @click="startDailyReview">📝 每日复盘</button>
          <button class="action-btn" @click="$router.push('/goals')">🎯 新建目标</button>
          <button class="action-btn" @click="exportData">📥 导出数据</button>
          <button class="action-btn" @click="clearChatHistory">🗑️ 清空聊天</button>
          <button class="action-btn" @click="syncFinance">🔄 同步记账</button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { useToast } from '@/composables/useToast'
import { reportApi } from '@/api'
import Skeleton from '@/components/Skeleton.vue'

const userStore = useUserStore()
const toast = useToast()
const loading = ref(true)
const pendingTasks = ref(0)
const todayTasks = ref<any[]>([])
const todayCheckins = ref(0)
const dimensionStats = ref<any[]>([])
const randomEvent = ref<any>(null)
const aiInsight = ref<any>(null)
const financeData = ref<any>(null)
const energyValue = ref(50)
const energyColor = ref('var(--primary)')
const energyLabel = ref('')
const weather = ref<any>(null)
const moodEmoji = ref('😊')
const moodDesc = ref('还好')
const weeklyReview = ref<any>(null)
const reviewLoading = ref(false)

const emotionMap: Record<string, string> = { happy: '开心', sad: '难过', anxious: '焦虑', excited: '兴奋', calm: '平静', angry: '生气' }

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const expForNext = computed(() => Math.floor(100 * Math.pow(1.15, userStore.level)))

// 空状态判断：所有维度都没有任何打卡记录 → 引导用户开始
const hasCheckin = computed(() => (dimensionStats.value || []).some((d: any) => (d.total_checkins || 0) > 0))
const allEmpty = computed(() => (dimensionStats.value || []).length > 0 && !hasCheckin.value)

const handleDimensionClick = (dim: any) => {
  const routes: Record<string, string> = {
    'health': '/checkin', 'finance': '/dashboard', 'learning': '/checkin',
    'career': '/tasks', 'social': '/chat', 'mental': '/checkin',
    'habits': '/habits', 'creativity': '/checkin'
  }
  const route = routes[dim.id] || '/checkin'
  window.open(`https://money.maomaoxia.top` + (dim.id === 'finance' ? '' : ''), dim.id === 'finance' ? '_blank' : '_self')
  if (dim.id !== 'finance') fetch(`/api/checkins`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dimension_id: dim.id, note: `来自Dashboard快速打卡` }) })
}

const handleEvent = async (choiceIndex: number) => {
  try {
    await fetch(`/api/events/${randomEvent.value?.id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ choice_index: choiceIndex }) })
  } catch(e) {}
  randomEvent.value = null
}

const toggleTask = async (task: any) => {
  if (task.status === 'completed') return
  try {
    const r = await fetch(`/api/tasks/${task.id}/complete`, { method: 'POST' })
    const d = await r.json()
    if (d.success) { task.status = 'completed'; toast.success(d.message || '已完成') }
  } catch(e) { toast.error('操作失败') }
}

const generateSmartTasks = async () => {
  try {
    const r = await fetch('/api/smart-tasks/generate-smart', { method: 'POST' })
    const d = await r.json()
    if (d.tasks?.length) toast.success(`生成了${d.tasks.length}个智能任务！`)
  } catch(e) { toast.error('生成失败') }
}

const startDailyReview = () => window.open('/daily-review', '_self')

const exportData = () => { window.open('/api/backup', '_blank') }

const clearChatHistory = async () => {
  if (confirm('确认清空所有聊天记录？')) {
    await fetch('/api/chat/history', { method: 'DELETE' })
    toast.success('已清空')
  }
}

const syncFinance = async () => {
  try {
    const r = await fetch('/api/finance/sync')
    const d = await r.json()
    toast.success(`同步了${d.synced}条记账记录`)
    loadDashboard()
  } catch(e) { toast.error('同步失败') }
}

const openFinance = () => window.open('https://money.maomaoxia.top', '_blank')

// 空状态引导：完成第一次打卡后刷新面板
const startFirstCheckin = async () => {
  const dim = dimensionStats.value[0]
  if (!dim) return
  if (dim.id === 'finance') { window.open('https://money.maomaoxia.top', '_blank'); return }
  try {
    await fetch('/api/checkins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dimension_id: dim.id, note: '来自Dashboard首次打卡引导' })
    })
  } catch (e) {}
  loadDashboard()
}

async function loadWeeklyReview() {
  reviewLoading.value = true
  try {
    const res = await reportApi.getWeekly()
    weeklyReview.value = res
  } catch(e) { console.error(e) }
  finally { reviewLoading.value = false }
}

const loadDashboard = async () => {
  loading.value = true
  try {
    const res = await fetch('/api/dashboard')
    const d = await res.json()
    pendingTasks.value = d.todayTasks?.filter((t: any) => t.status !== 'completed').length || 0
    todayTasks.value = d.todayTasks || []
    todayCheckins.value = d.todayCheckins || 0
    dimensionStats.value = (d.dimensionStats || []).map((ds: any) => ({
      ...ds,
      score: d.user?.['stat_' + ds.id] || 50
    }))
    randomEvent.value = d.randomEvent
    aiInsight.value = d.aiInsight
    financeData.value = d.finance
    userStore.fetchUser()
  } catch(e) { console.error('Dashboard load error:', e) }
  loading.value = false
}

onMounted(async () => {
  await loadDashboard()
  loadWeeklyReview()
})
</script>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px; }

.onboarding-banner { background: linear-gradient(135deg, var(--primary), var(--secondary)); border-radius: 12px; padding: 20px; color: white; }
.banner-content { display: flex; align-items: center; gap: 16px; }
.banner-icon { font-size: 36px; }
.banner-text h3 { margin: 0; font-size: 18px; }
.banner-text p { margin: 4px 0 0; font-size: 13px; opacity: 0.9; }

.event-banner { background: var(--bg-card); border: 2px solid; border-radius: 12px; padding: 16px; display: flex; gap: 12px; align-items: flex-start; animation: slideIn 0.5s; }
.event-icon { font-size: 28px; }
.event-title { font-weight: 600; margin-bottom: 4px; }
.event-desc { font-size: 13px; color: var(--text-dim); margin-bottom: 8px; }
.event-choices { display: flex; gap: 8px; flex-wrap: wrap; }
.event-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid var(--primary); background: transparent; color: var(--primary); cursor: pointer; font-size: 13px; }
.event-btn:hover { background: var(--primary); color: white; }

.status-bar { display: flex; gap: 16px; padding: 8px 16px; background: var(--bg-card); border-radius: 8px; font-size: 13px; }
.welcome-banner { background: var(--bg-card); border-radius: 12px; padding: 20px; }
.welcome-text h2 { margin: 0 0 8px; font-size: 20px; }
.welcome-text p { font-size: 13px; color: var(--text-dim); }
.progress-bar { height: 6px; background: var(--bg-input); border-radius: 3px; margin: 12px 0 4px; }
.progress-fill { height: 100%; background: var(--primary); border-radius: 3px; transition: width 0.3s; }
.exp-text { font-size: 11px; color: var(--text-dim); }

.stat-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
.stat-card { background: var(--bg-card); border-radius: 12px; padding: 16px; text-align: center; cursor: pointer; transition: transform 0.2s; border: 1px solid var(--border); }
.stat-card:hover { transform: translateY(-2px); }
.stat-icon { font-size: 24px; margin-bottom: 4px; }
.stat-value { font-size: 22px; font-weight: 700; }
.stat-value.small { font-size: 14px; }
.stat-value.positive { color: #4CAF50; }
.stat-value.negative { color: #F44336; }
.stat-label { font-size: 12px; color: var(--text-dim); margin-top: 2px; }

.insight-banner { background: linear-gradient(135deg, rgba(103, 58, 183, 0.1), rgba(33, 150, 243, 0.1)); border: 1px solid rgba(103, 58, 183, 0.3); border-radius: 12px; padding: 14px 16px; display: flex; align-items: center; gap: 12px; }
.insight-icon { font-size: 24px; }
.insight-text { flex: 1; font-size: 13px; }
.btn-sm { padding: 4px 12px; font-size: 12px; border-radius: 6px; border: 1px solid var(--primary); background: transparent; color: var(--primary); cursor: pointer; white-space: nowrap; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }

.card { background: var(--bg-card); border-radius: 12px; padding: 16px; border: 1px solid var(--border); }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.card-title { font-weight: 600; }

.dimension-list { display: flex; flex-direction: column; gap: 8px; }
.dimension-item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; cursor: pointer; transition: background 0.2s; }
.dimension-item:hover { background: var(--bg-input); }
.dim-icon { font-size: 20px; width: 30px; text-align: center; }
.dim-info { flex: 1; }
.dim-name { font-size: 13px; margin-bottom: 4px; }
.dim-bar { height: 4px; background: var(--bg-input); border-radius: 2px; }
.dim-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }
.dim-value { font-weight: 600; font-size: 14px; min-width: 30px; text-align: right; }

.task-list { display: flex; flex-direction: column; gap: 6px; }
.task-item { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; }
.task-item.done { opacity: 0.6; }
.task-item.done .task-title { text-decoration: line-through; }
.task-status { cursor: pointer; font-size: 18px; }
.task-info { flex: 1; }
.task-title { font-size: 13px; }
.task-meta { font-size: 11px; color: var(--text-dim); display: flex; gap: 12px; }

.finance-card { margin-top: 0; }
.finance-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
@media (max-width: 768px) { .finance-grid { grid-template-columns: repeat(2, 1fr); } }
.finance-item { text-align: center; padding: 12px; border-radius: 8px; background: var(--bg-input); }
.finance-label { font-size: 12px; color: var(--text-dim); }
.finance-value { font-size: 18px; font-weight: 600; margin-top: 4px; }
.finance-value.income { color: #4CAF50; }
.finance-value.expense { color: #F44336; }

.quick-actions { margin-top: 0; }
.action-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
@media (max-width: 768px) { .action-grid { grid-template-columns: repeat(2, 1fr); } }
.action-btn { padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-input); color: var(--text); cursor: pointer; font-size: 13px; transition: all 0.2s; }
.action-btn:hover { border-color: var(--primary); color: var(--primary); }

.empty-state { text-align: center; padding: 24px; color: var(--text-dim); font-size: 14px; }

/* 维度空状态引导 */
.dimension-empty { text-align: center; padding: 28px 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.de-emoji { font-size: 48px; animation: floatY 2.4s ease-in-out infinite; }
.de-title { font-size: 17px; font-weight: 700; }
.de-desc { font-size: 13px; color: var(--text-dim); line-height: 1.6; max-width: 320px; }
.de-desc strong { color: var(--primary); }
.de-btn { margin-top: 4px; padding: 10px 22px; font-size: 14px; border-radius: 10px; }
.de-hint { font-size: 11px; color: var(--text-dim); opacity: 0.8; }
@keyframes floatY { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }

/* 未开始维度（有记录但从未打卡） */
.dimension-item.dim-inactive { opacity: 0.55; }
.dim-tag { display: inline-block; margin-left: 6px; font-size: 10px; padding: 1px 6px; border-radius: 6px; background: var(--bg-input); color: var(--text-dim); vertical-align: middle; }
.dim-fill-empty { background: var(--bg-input) !important; }

@keyframes slideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

.report-card { margin-top: 0; }
.report-card h3 { margin: 0 0 12px; font-size: 15px; }
.review-text { font-size: 13px; color: var(--text-dim); line-height: 1.5; margin-bottom: 8px; }
.review-stats { display: flex; gap: 16px; font-size: 13px; margin-bottom: 12px; }
.review-stats span { color: var(--text-dim); }
.review-actions { display: flex; gap: 8px; }
.btn-small { padding: 6px 14px; font-size: 12px; border-radius: 6px; border: 1px solid var(--primary); background: transparent; color: var(--primary); cursor: pointer; }
.btn-small:disabled { opacity: 0.5; cursor: not-allowed; }
.empty-hint { color: var(--text-dim); font-size: 13px; margin-bottom: 12px; }
</style>
