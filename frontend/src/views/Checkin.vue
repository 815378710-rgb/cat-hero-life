<template>
  <div class="checkin-page">
    <div class="page-header">
      <h2>✅ 快捷打卡</h2>
      <span class="text-dim">今日已打卡 {{ todayTotal }} 次</span>
    </div>

    <!-- Quick Checkin Grid -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">⚡ 快捷打卡</div>
        <button class="btn btn-sm btn-primary" @click="oneClickCheckin">⚡ 一键打卡</button>
      </div>
      <div class="checkin-grid">
        <div v-for="item in quickItems" :key="item.id" class="checkin-card" @click="doCheckin(item)">
          <div class="checkin-icon">{{ item.icon }}</div>
          <div class="checkin-name">{{ item.title }}</div>
          <div class="checkin-value">{{ item.value }}{{ item.unit }}</div>
        </div>
      </div>
    </div>

    <!-- Sign In -->
    <div class="card">
      <div class="card-header"><div class="card-title">📅 每日签到</div></div>
      <div class="signin-area">
        <button class="btn btn-primary btn-lg" @click="doSignIn" :disabled="signedToday">
          {{ signedToday ? '✅ 今日已签到' : '🐱 签到' }}
        </button>
        <p class="text-dim mt-8" v-if="streak > 0">连续签到 {{ streak }} 天 🔥</p>
      </div>
    </div>

    <!-- Today Records -->
    <div class="card">
      <div class="card-header"><div class="card-title">📝 今日记录</div></div>
      <div v-if="records.length === 0" class="empty-state">今天还没有打卡记录~</div>
      <div v-for="r in records" :key="r.id" class="record-item">
        <span>{{ r.dimension_icon || '📌' }} {{ r.title }}</span>
        <span class="text-dim">{{ r.value ? r.value + (r.unit || '') : '' }} · {{ formatTime(r.checked_at) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { checkinApi, gamificationApi } from '@/api'

const todayTotal = ref(0)
const streak = ref(0)
const signedToday = ref(false)
const records = ref<any[]>([])

const quickItems = [
  { id: 'water', icon: '💧', title: '喝水', dimension_id: 'health', value: 250, unit: 'ml' },
  { id: 'exercise', icon: '🏃', title: '运动', dimension_id: 'health', value: 30, unit: '分钟' },
  { id: 'read', icon: '📖', title: '阅读', dimension_id: 'learning', value: 30, unit: '分钟' },
  { id: 'meditate', icon: '🧘', title: '冥想', dimension_id: 'mental', value: 10, unit: '分钟' },
  { id: 'expense', icon: '💰', title: '记账', dimension_id: 'finance', value: 1, unit: '笔' },
  { id: 'social', icon: '💬', title: '社交', dimension_id: 'social', value: 1, unit: '次' },
  { id: 'create', icon: '🎨', title: '创作', dimension_id: 'creativity', value: 30, unit: '分钟' },
  { id: 'custom', icon: '➕', title: '自定义', dimension_id: 'habits', value: 1, unit: '次' },
]

const formatTime = (t: string) => t ? t.slice(11, 16) : ''

const loadData = async () => {
  const [today, streakData, checkins] = await Promise.all([
    checkinApi.getToday(),
    gamificationApi.getStreak(),
    fetch('/api/checkins?limit=20').then(r => r.json())
  ])
  todayTotal.value = today.total || 0
  streak.value = streakData.streak || 0
  signedToday.value = streakData.signed_today || false
  records.value = checkins.checkins || []
}

const doCheckin = async (item: any) => {
  const res = await checkinApi.checkin({ dimension_id: item.dimension_id, title: item.title, value: item.value })
  if (res.success) {
    showToast(`${item.title}打卡成功！+${res.exp}EXP`)
    await loadData()
  }
}

const oneClickCheckin = async () => {
  let count = 0
  for (const item of quickItems.slice(0, 3)) {
    const res = await checkinApi.checkin({ dimension_id: item.dimension_id, title: item.title, value: item.value })
    if (res.success) count++
  }
  showToast(`一键打卡完成！${count}项`)
  await loadData()
}

const doSignIn = async () => {
  const res = await fetch('/api/user/signin', { method: 'POST' }).then(r => r.json())
  showToast(res.message)
  await loadData()
}

const showToast = (msg: string) => {
  const el = document.createElement('div')
  el.className = 'toast toast-success'
  el.textContent = msg
  document.getElementById('toast-container')?.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

onMounted(loadData)
</script>

<style scoped>
.checkin-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.card-title { font-size: 16px; font-weight: 600; }

.checkin-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.checkin-card {
  background: var(--bg-input); border: 1px solid var(--border); border-radius: 12px;
  padding: 16px; text-align: center; cursor: pointer; transition: all 0.2s;
}
.checkin-card:hover { border-color: var(--primary); transform: translateY(-2px); }
.checkin-icon { font-size: 28px; margin-bottom: 8px; }
.checkin-name { font-size: 12px; margin-bottom: 4px; }
.checkin-value { font-size: 11px; color: var(--text-dim); }

.signin-area { text-align: center; padding: 20px; }

.record-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 14px; }

.empty-state { text-align: center; padding: 30px; color: var(--text-dim); }
.text-dim { color: var(--text-dim); font-size: 13px; }
.mt-8 { margin-top: 8px; }

.btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s; }
.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-dark); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-lg { padding: 16px 40px; font-size: 18px; }
.btn-sm { padding: 6px 12px; font-size: 12px; }
.btn-secondary { background: var(--bg-card-hover); color: var(--text); border: 1px solid var(--border); }

@media (max-width: 768px) { .checkin-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
