<template>
  <div class="heatmap-page">
    <div class="page-header"><h2>🔥 打卡热力图</h2><span class="text-dim">{{ activeDays }}天活跃 · {{ totalCheckins }}次打卡</span></div>
    <div class="card">
      <div class="heatmap-grid">
        <div v-for="day in heatmap" :key="day.date" class="heatmap-cell" :style="{ background: getColor(day.count) }" :title="day.date + ': ' + day.count + '次'"></div>
      </div>
      <div class="legend"><span>少</span><div v-for="i in 4" :key="i" class="legend-cell" :style="{ background: getColor(i-1) }"></div><span>多</span></div>
    </div>
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-val">{{ totalCheckins }}</div><div class="stat-lbl">总打卡</div></div>
      <div class="stat-card"><div class="stat-val">{{ activeDays }}</div><div class="stat-lbl">活跃天数</div></div>
      <div class="stat-card"><div class="stat-val">{{ activeDays > 0 ? Math.round(totalCheckins/activeDays) : 0 }}</div><div class="stat-lbl">日均打卡</div></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
const heatmap = ref<any[]>([])
const activeDays = ref(0)
const totalCheckins = ref(0)
const getColor = (count: number) => {
  if (count === 0) return 'var(--bg-input)'
  if (count <= 2) return 'rgba(255,107,157,0.3)'
  if (count <= 4) return 'rgba(255,107,157,0.6)'
  return 'var(--primary)'
}
onMounted(async () => {
  const res = await fetch('/api/life-dashboard/heatmap?days=180').then(r => r.json())
  heatmap.value = res.heatmap || []
  activeDays.value = res.activeDays || 0
  totalCheckins.value = res.total || 0
})
</script>
<style scoped>
.heatmap-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.heatmap-grid { display: flex; flex-wrap: wrap; gap: 2px; }
.heatmap-cell { width: 14px; height: 14px; border-radius: 3px; }
.legend { display: flex; align-items: center; gap: 4px; margin-top: 12px; font-size: 11px; color: var(--text-dim); }
.legend-cell { width: 14px; height: 14px; border-radius: 3px; }
.stat-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stat-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; text-align: center; }
.stat-val { font-size: 24px; font-weight: 700; }
.stat-lbl { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
.text-dim { color: var(--text-dim); font-size: 13px; }
</style>
