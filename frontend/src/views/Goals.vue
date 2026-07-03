<template>
  <div class="goals-page">
    <div class="page-header"><h2>🎯 目标管理</h2><button class="btn btn-primary" @click="showCreate=true"><i class="fas fa-plus"></i> 新建</button></div>
    <div v-if="goals.length===0" class="empty-state">还没有设定目标~</div>
    <div v-for="g in goals" :key="g.id" class="goal-item">
      <div class="goal-icon">{{ g.dimension_icon || '🎯' }}</div>
      <div class="goal-content">
        <div class="goal-title">{{ g.title }}</div>
        <div class="goal-meta">{{ g.dimension_name }} · {{ g.status }}</div>
        <div v-if="g.target_value" class="progress-bar"><div class="progress-fill" :style="{width: Math.min(100, (g.current_value||0)/g.target_value*100)+'%'}"></div></div>
        <span v-if="g.target_value" class="text-dim">{{ g.current_value||0 }}/{{ g.target_value }} {{ g.unit||'' }}</span>
      </div>
    </div>
    <div v-if="showCreate" class="modal-overlay active" @click="showCreate=false">
      <div class="modal" @click.stop>
        <div class="modal-header"><h3>新建目标</h3><button class="btn-icon" @click="showCreate=false">✕</button></div>
        <div class="modal-body">
          <div class="input-group"><label>目标</label><input v-model="form.title" class="input" placeholder="例如：3个月减5斤" /></div>
          <div class="input-group"><label>维度</label><select v-model="form.dimension_id" class="input"><option value="health">🏋️ 健康</option><option value="finance">💰 财务</option><option value="learning">📚 学习</option><option value="career">💼 职业</option></select></div>
          <div class="grid-2"><div class="input-group"><label>目标值</label><input v-model.number="form.target_value" type="number" class="input" /></div><div class="input-group"><label>单位</label><input v-model="form.unit" class="input" placeholder="kg/本/次" /></div></div>
          <button class="btn btn-primary" style="width:100%" @click="create">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { goalApi } from '@/api'
const goals = ref<any[]>([])
const showCreate = ref(false)
const form = ref({ title: '', dimension_id: 'health', target_value: 0, unit: '' })
const load = async () => { goals.value = (await goalApi.getGoals()).goals || [] }
const create = async () => {
  if (!form.value.title.trim()) return
  await goalApi.createGoal(form.value)
  showCreate.value = false; form.value = { title: '', dimension_id: 'health', target_value: 0, unit: '' }
  await load()
}
onMounted(load)
</script>
<style scoped>
.goals-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.goal-item { display: flex; align-items: center; gap: 16px; padding: 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 8px; }
.goal-icon { font-size: 28px; }
.goal-content { flex: 1; }
.goal-title { font-size: 14px; font-weight: 600; }
.goal-meta { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
.progress-bar { height: 6px; background: var(--bg-input); border-radius: 3px; margin-top: 8px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, var(--primary), var(--secondary)); }
.empty-state { text-align: center; padding: 40px; color: var(--text-dim); }
.text-dim { color: var(--text-dim); font-size: 11px; }
.btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; }
.btn-primary { background: var(--primary); color: white; }
.btn-icon { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 18px; }
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 200; align-items: center; justify-content: center; }
.modal-overlay.active { display: flex; }
.modal { background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border); width: 90%; max-width: 500px; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.modal-body { padding: 20px; }
.input-group { margin-bottom: 16px; }
.input-group label { display: block; font-size: 12px; color: var(--text-dim); margin-bottom: 6px; }
.input { width: 100%; padding: 10px 14px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 14px; outline: none; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
</style>
