<template>
  <div class="stats-page">
    <h2>📊 {{ t('stats.title') }}</h2>
    <div class="stats-grid">
      <div class="stat-card"><div class="v">{{ stats.totalCheckins }}</div><div class="l">{{ t('stats.totalCheckins') }}</div></div>
      <div class="stat-card"><div class="v">{{ stats.currentStreak }}</div><div class="l">{{ t('stats.currentStreak') }}</div></div>
      <div class="stat-card"><div class="v">{{ stats.maxStreak }}</div><div class="l">{{ t('stats.maxStreak') }}</div></div>
      <div class="stat-card"><div class="v">{{ stats.coins }}</div><div class="l">金币</div></div>
    </div>
    <div class="chart-card" v-if="stats.weekly">
      <h3>{{ t('stats.weeklyTrend') }}</h3>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()

const stats = ref({ totalCheckins: 0, currentStreak: 0, maxStreak: 0, coins: 0, weekly: [] })

onMounted(async () => {
  try {
    const [heatmapRes, coachRes] = await Promise.all([
      fetch('/api/checkins/heatmap?days=365'),
      fetch('/api/coach/advice')
    ])
    const heatmap = await heatmapRes.json()
    const coach = await coachRes.json()
    stats.value = {
      totalCheckins: heatmap.total || 0,
      currentStreak: heatmap.currentStreak || 0,
      maxStreak: heatmap.maxStreak || 0,
      coins: coach.stats?.coins || 0,
      weekly: heatmap.weeks || []
    }
  } catch (e) {}
})
</script>

<style scoped>
.stats-page h2 { font-size: 22px; margin-bottom: 20px; }
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
.stat-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; text-align: center; }
.stat-card .v { font-size: 28px; font-weight: 700; color: var(--primary); }
.stat-card .l { font-size: 12px; color: var(--text-dim); margin-top: 6px; }
.chart-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.chart-card h3 { font-size: 16px; margin-bottom: 16px; }
@media (max-width: 768px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
</style>
