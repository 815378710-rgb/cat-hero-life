<template>
  <div class="events-page">
    <div class="page-header">
      <h2>🎲 随机事件</h2>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm btn-primary" @click="seedEvents" :disabled="loading">🎲 刷新事件</button>
        <button class="btn btn-sm btn-primary" @click="loadEvents" :disabled="loading">🔄 刷新</button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="skeleton-card" v-for="i in 3" :key="i"></div>
    </div>

    <div v-else-if="events.length === 0" class="empty-state">
      <div class="empty-icon">🎉</div>
      <div class="empty-text">当前没有活跃事件</div>
      <div class="empty-hint">完成更多任务来触发随机事件吧！</div>
    </div>

    <template v-else>
      <TransitionGroup name="event-list" tag="div" class="event-list">
        <div
          v-for="event in events"
          :key="event.id"
          class="event-card"
          :style="{ borderLeftColor: event.color || 'var(--primary)' }"
        >
          <div class="event-header">
            <div class="event-icon" :style="{ color: event.color || 'var(--primary)' }">
              {{ event.icon || '🎲' }}
            </div>
            <div class="event-info">
              <div class="event-title">{{ event.title }}</div>
              <div class="event-desc">{{ event.description }}</div>
            </div>
          </div>

          <div class="event-choices">
            <button
              v-for="(choice, i) in event.choices"
              :key="choice.text"
              class="choice-btn"
              :style="(choice.exp ?? 0) > 0 ? { borderColor: event.color || 'var(--primary)', color: event.color || 'var(--primary)' } : {}"
              @click="handleChoice(event, i, choice)"
              :disabled="responding.has(event.id)"
            >
              <span>{{ choice.text }}</span>
              <span v-if="choice.exp || choice.coins" class="choice-effects">
                <span v-if="choice.exp" class="eff-tag exp">+{{ choice.exp }}EXP</span>
                <span v-if="choice.coins" class="eff-tag coins">+{{ choice.coins }}🪙</span>
              </span>
            </button>
          </div>
        </div>
      </TransitionGroup>

      <div v-if="resultLog.length > 0" class="result-log">
        <div class="card">
          <div class="card-header"><div class="card-title">📋 事件记录</div></div>
          <div v-for="(log, i) in resultLog" :key="i" class="log-item">
            <span class="log-icon">{{ log.icon }}</span>
            <span class="log-text">{{ log.message }}</span>
            <span class="log-time">{{ log.time }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Choice {
  text: string
  exp?: number
  coins?: number
  stat_change?: Record<string, number>
}

interface Event {
  id: string
  title: string
  description: string
  icon: string
  choices: Choice[]
  color: string
}

interface LogEntry {
  icon: string
  message: string
  time: string
}

const events = ref<Event[]>([])
const loading = ref(true)
const responding = ref(new Set<string>())
const resultLog = ref<LogEntry[]>([])

const loadEvents = async () => {
  loading.value = true
  try {
    const res = await fetch('/api/events')
    const data = await res.json()
    events.value = data.events || []
  } catch (e) {
    showToast('加载事件失败')
  }
  loading.value = false
}

const seedEvents = async () => {
  try {
    await fetch('/api/events/seed', { method: 'POST' })
    showToast('事件已刷新')
    await loadEvents()
  } catch { showToast('刷新事件失败') }
}

const handleChoice = async (event: Event, choiceIndex: number, choice: Choice) => {
  if (responding.value.has(event.id)) return
  responding.value.add(event.id)

  try {
    const res = await fetch(`/api/events/${event.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice_index: choiceIndex })
    })
    const data = await res.json()

    resultLog.value.unshift({
      icon: event.icon,
      message: `「${event.title}」选择了「${choice.text}」${data.message || ''}`,
      time: new Date().toLocaleTimeString()
    })

    showToast(`选择「${choice.text}」${data.message || '已完成！'}`)

    // Remove the event from the list with animation
    events.value = events.value.filter(e => e.id !== event.id)
  } catch (e) {
    showToast('响应失败，请重试')
  }

  responding.value.delete(event.id)
}

const showToast = (msg: string) => {
  const el = document.createElement('div')
  el.className = 'toast toast-success'
  el.textContent = msg
  document.getElementById('toast-container')?.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

onMounted(loadEvents)
</script>

<style scoped>
.events-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }

.event-list { display: flex; flex-direction: column; gap: 12px; }

.event-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-left: 4px solid var(--primary);
  border-radius: 12px;
  padding: 16px;
  animation: slideIn 0.3s;
}
@keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }

.event-header { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 14px; }
.event-icon { font-size: 32px; flex-shrink: 0; width: 44px; text-align: center; }
.event-info { flex: 1; }
.event-title { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
.event-desc { font-size: 13px; color: var(--text-dim); line-height: 1.5; }

.event-choices { display: flex; gap: 10px; flex-wrap: wrap; }

.choice-btn {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 18px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--bg-input); color: var(--text); cursor: pointer;
  font-size: 14px; transition: all 0.2s; min-width: 80px;
}
.choice-btn:hover:not(:disabled) { border-color: var(--primary); transform: translateY(-1px); }
.choice-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.choice-effects { display: flex; gap: 6px; flex-wrap: wrap; }
.eff-tag { font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
.eff-tag.exp { background: rgba(103, 58, 183, 0.15); color: #7C4DFF; }
.eff-tag.coins { background: rgba(255, 193, 7, 0.15); color: #FFB300; }
.eff-tag.hp { background: rgba(244, 67, 54, 0.15); color: #F44336; }

.result-log { margin-top: 24px; }
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.card-title { font-weight: 600; }

.log-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.log-item:last-child { border-bottom: none; }
.log-icon { font-size: 18px; }
.log-text { flex: 1; color: var(--text); }
.log-time { font-size: 11px; color: var(--text-dim); white-space: nowrap; }

.empty-state { text-align: center; padding: 60px 20px; color: var(--text-dim); }
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-text { font-size: 16px; margin-bottom: 4px; }
.empty-hint { font-size: 13px; }

.loading-state { display: flex; flex-direction: column; gap: 12px; }
.skeleton-card { height: 120px; background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-input) 50%, var(--bg-card) 75%); border-radius: 12px; animation: shimmer 1.5s infinite; background-size: 200% 100%; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; }
.btn-primary { background: var(--primary); color: white; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm { padding: 6px 12px; font-size: 12px; }

.event-list-enter-active, .event-list-leave-active { transition: all 0.3s ease; }
.event-list-enter-from { opacity: 0; transform: translateX(-20px); }
.event-list-leave-to { opacity: 0; transform: translateX(20px); }
.event-list-leave-active { position: absolute; }
</style>
