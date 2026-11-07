<template>
  <div class="achievements-page">
    <div class="page-header"><h2>🏆 成就系统</h2><span class="text-dim">{{ unlocked }}/{{ total }}</span></div>
    <div class="progress-bar mb-16"><div class="progress-fill" :style="{ width: (total > 0 ? unlocked/total*100 : 0) + '%' }"></div></div>
    <div class="achievement-grid">
      <div v-for="a in achievements" :key="a.id" class="ach-card" :class="{ unlocked: a.unlocked, locked: !a.unlocked }">
        <div class="ach-icon">{{ a.icon }}</div>
        <div class="ach-name">{{ a.name }}</div>
        <div class="ach-desc">{{ a.description }}</div>
        <span class="badge" :class="'badge-' + a.rarity">{{ a.rarity }}</span>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { gamificationApi } from '@/api'
const achievements = ref<any[]>([])
const unlocked = ref(0)
const total = ref(0)
onMounted(async () => {
  const res = await gamificationApi.getAchievements()
  achievements.value = res.achievements || []
  unlocked.value = res.unlocked || 0
  total.value = res.total || 0
})
</script>
<style scoped>
.achievements-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.mb-16 { margin-bottom: 16px; }
.progress-bar { height: 8px; background: var(--bg-input); border-radius: 4px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, var(--primary), var(--secondary)); }
.achievement-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.ach-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; text-align: center; transition: all 0.2s; }
.ach-card.unlocked { border-color: var(--accent); background: rgba(255,230,109,0.05); }
.ach-card.locked { opacity: 0.5; }
.ach-icon { font-size: 36px; margin-bottom: 8px; }
.ach-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.ach-desc { font-size: 11px; color: var(--text-dim); }
.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; margin-top: 8px; }
.badge-common { background: rgba(136,136,170,0.2); color: var(--text-dim); }
.badge-rare { background: rgba(33,150,243,0.2); color: var(--info); }
.badge-epic { background: rgba(156,39,176,0.2); color: #CE93D8; }
.badge-legendary { background: rgba(255,215,0,0.2); color: #FFD700; }
.text-dim { color: var(--text-dim); }
</style>
