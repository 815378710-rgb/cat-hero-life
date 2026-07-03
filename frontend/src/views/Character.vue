<template>
  <div class="character-page">
    <div class="grid-2">
      <!-- Character Info -->
      <div class="card">
        <div class="card-header"><div class="card-title">👤 角色信息</div></div>
        <div class="text-center" style="padding:20px">
          <div style="font-size:80px;margin-bottom:16px">🐱</div>
          <h2>Lv.{{ level }} 猫猫侠</h2>
          <div class="progress-bar"><div class="progress-fill" :style="{ width: expProgress + '%' }"></div></div>
          <span class="text-dim">{{ exp }} / {{ expForNext }} EXP ({{ expProgress }}%)</span>
          <div class="stat-row">
            <div class="stat-item"><div class="stat-val">{{ totalExp }}</div><div class="stat-lbl">总经验</div></div>
            <div class="stat-item"><div class="stat-val">{{ coins }}</div><div class="stat-lbl">金币</div></div>
            <div class="stat-item"><div class="stat-val">{{ streak }}</div><div class="stat-lbl">连续签到</div></div>
          </div>
        </div>
      </div>

      <!-- Radar Chart -->
      <div class="card">
        <div class="card-header"><div class="card-title">📊 属性雷达图</div></div>
        <canvas ref="radarCanvas" width="350" height="350"></canvas>
      </div>
    </div>

    <!-- Stats Detail -->
    <div class="card">
      <div class="card-header"><div class="card-title">📈 属性详情</div></div>
      <div class="dimension-grid">
        <div v-for="d in dimensions" :key="d.id" class="dim-card">
          <div class="dim-icon">{{ d.icon }}</div>
          <div class="dim-name">{{ d.name }}</div>
          <div class="dim-value" :style="{ color: d.value >= 60 ? 'var(--success)' : d.value >= 30 ? 'var(--warning)' : 'var(--danger)' }">{{ d.value }}</div>
          <div class="dim-bar"><div class="dim-bar-fill" :style="{ width: d.value + '%', background: d.color }"></div></div>
        </div>
      </div>
      <div class="text-center mt-16">
        <span class="text-dim">综合战力：</span>
        <span style="font-size:24px;font-weight:700;color:var(--primary)">{{ totalPower }}/800</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useUserStore } from '@/stores/user'
import { Chart, RadarController, RadialLinearScale, PointElement, LineElement, Filler } from 'chart.js'

Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler)

const userStore = useUserStore()
const radarCanvas = ref<HTMLCanvasElement>()

const level = computed(() => userStore.level)
const exp = computed(() => userStore.user?.exp || 0)
const totalExp = computed(() => userStore.user?.total_exp || 0)
const coins = computed(() => userStore.coins)
const streak = computed(() => userStore.streak)
const expForNext = computed(() => Math.floor(100 * Math.pow(1.15, level.value)))
const expProgress = computed(() => Math.round((exp.value / expForNext.value) * 100))
const totalPower = computed(() => userStore.totalPower)

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

onMounted(async () => {
  await userStore.fetchUser()
  await nextTick()
  if (radarCanvas.value) {
    new Chart(radarCanvas.value, {
      type: 'radar',
      data: {
        labels: dimensions.value.map(d => d.name),
        datasets: [{
          label: '属性值',
          data: dimensions.value.map(d => d.value),
          backgroundColor: 'rgba(255,107,157,0.2)',
          borderColor: 'rgba(255,107,157,0.8)',
          borderWidth: 2,
          pointBackgroundColor: dimensions.value.map(d => d.color),
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        scales: { r: { beginAtZero: true, max: 100, ticks: { display: false }, grid: { color: 'rgba(255,255,255,0.1)' }, pointLabels: { color: '#E8E8E8', font: { size: 12 } } } },
        plugins: { legend: { display: false } }
      }
    })
  }
})
</script>

<style scoped>
.character-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.card-title { font-size: 16px; font-weight: 600; }
.text-center { text-align: center; }
.text-dim { color: var(--text-dim); font-size: 13px; }
.mt-16 { margin-top: 16px; }
.stat-row { display: flex; justify-content: center; gap: 24px; margin-top: 16px; }
.stat-item { text-align: center; }
.stat-val { font-size: 24px; font-weight: 700; }
.stat-lbl { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
.progress-bar { width: 100%; max-width: 300px; height: 8px; background: var(--bg-input); border-radius: 4px; margin: 8px auto; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--primary), var(--secondary)); }
.dimension-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.dim-card { text-align: center; }
.dim-icon { font-size: 24px; margin-bottom: 4px; }
.dim-name { font-size: 11px; color: var(--text-dim); margin-bottom: 4px; }
.dim-value { font-size: 18px; font-weight: 700; }
.dim-bar { width: 100%; height: 4px; background: var(--bg-input); border-radius: 2px; margin-top: 6px; overflow: hidden; }
.dim-bar-fill { height: 100%; border-radius: 2px; transition: width 0.5s; }
@media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } .dimension-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
