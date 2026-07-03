<template>
  <div class="habits-page">
    <div class="page-header">
      <h2>🔄 习惯追踪</h2>
      <button class="btn btn-secondary" @click="showCreate = true"><i class="fas fa-plus"></i> 新建</button>
    </div>

    <div class="card">
      <div v-if="habits.length === 0" class="empty-state">还没有习惯，点击新建开始追踪~</div>
      <div v-for="h in habits" :key="h.id" class="habit-item">
        <div class="habit-icon">{{ h.icon || '🎯' }}</div>
        <div class="habit-info">
          <div class="habit-name">{{ h.name }}</div>
          <div class="habit-streak">🔥 连续{{ h.current_streak }}天 · 最佳{{ h.best_streak }}天</div>
        </div>
        <div class="habit-dots">
          <div v-for="i in h.target_count" :key="i" class="habit-dot" :class="{ filled: i <= (h.today_count || 0) }" @click="logHabit(h.id)">
            {{ i <= (h.today_count || 0) ? '✓' : '' }}
          </div>
        </div>
        <span class="text-dim">{{ h.today_count || 0 }}/{{ h.target_count }}</span>
      </div>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreate" class="modal-overlay active" @click="showCreate = false">
      <div class="modal" @click.stop>
        <div class="modal-header"><h3>新建习惯</h3><button class="btn-icon" @click="showCreate = false">✕</button></div>
        <div class="modal-body">
          <div class="input-group"><label>名称</label><input v-model="form.name" class="input" placeholder="例如：喝水" /></div>
          <div class="input-group"><label>维度</label>
            <select v-model="form.dimension_id" class="input">
              <option value="health">🏋️ 健康</option><option value="finance">💰 财务</option>
              <option value="learning">📚 学习</option><option value="habits">🎯 习惯</option>
              <option value="mental">🧘 心理</option><option value="creativity">🎨 创造</option>
            </select>
          </div>
          <div class="input-group"><label>每日目标次数</label><input v-model.number="form.target_count" type="number" class="input" min="1" /></div>
          <div class="input-group"><label>图标</label><input v-model="form.icon" class="input" value="🎯" maxlength="2" /></div>
          <button class="btn btn-primary" style="width:100%" @click="createHabit">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { habitApi } from '@/api'

const habits = ref<any[]>([])
const showCreate = ref(false)
const form = ref({ name: '', dimension_id: 'health', target_count: 1, icon: '🎯' })

const load = async () => { habits.value = (await habitApi.getHabits()).habits || [] }

const logHabit = async (id: string) => {
  await habitApi.logHabit(id)
  await load()
}

const createHabit = async () => {
  if (!form.value.name.trim()) return
  await fetch('/api/habits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form.value) })
  showCreate.value = false
  form.value = { name: '', dimension_id: 'health', target_count: 1, icon: '🎯' }
  await load()
}

onMounted(load)
</script>

<style scoped>
.habits-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.habit-item { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.habit-icon { font-size: 28px; }
.habit-info { flex: 1; }
.habit-name { font-size: 14px; font-weight: 600; }
.habit-streak { font-size: 11px; color: var(--warning); margin-top: 4px; }
.habit-dots { display: flex; gap: 4px; }
.habit-dot { width: 20px; height: 20px; border-radius: 50%; background: var(--bg-input); border: 2px solid var(--border); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 10px; transition: all 0.2s; }
.habit-dot.filled { background: var(--success); border-color: var(--success); color: white; }
.empty-state { text-align: center; padding: 40px; color: var(--text-dim); }
.text-dim { color: var(--text-dim); font-size: 11px; }
.btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; }
.btn-primary { background: var(--primary); color: white; }
.btn-secondary { background: var(--bg-card-hover); color: var(--text); border: 1px solid var(--border); }
.btn-icon { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 18px; }
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 200; align-items: center; justify-content: center; }
.modal-overlay.active { display: flex; }
.modal { background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border); width: 90%; max-width: 400px; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.modal-body { padding: 20px; }
.input-group { margin-bottom: 16px; }
.input-group label { display: block; font-size: 12px; color: var(--text-dim); margin-bottom: 6px; }
.input { width: 100%; padding: 10px 14px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 14px; outline: none; }
</style>
