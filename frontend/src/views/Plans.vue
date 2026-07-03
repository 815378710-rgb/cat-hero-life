<template>
  <div class="plans-page">
    <div class="page-header"><h2>🗺️ 人生规划</h2></div>
    <div v-if="!profile?.onboarding_completed" class="card" style="border-color:var(--warning)">
      <div style="display:flex;align-items:center;gap:16px">
        <span style="font-size:32px">📋</span>
        <div><h4>你还没有建立人生档案</h4><p class="text-dim">建档后，猫猫侠会根据你的情况制定专属规划</p></div>
        <button class="btn btn-primary" @click="$router.push('/onboarding')">开始建档</button>
      </div>
    </div>
    <div v-for="p in plans" :key="p.id" class="card">
      <div class="card-header"><div class="card-title">{{ p.dimension_icon || '📌' }} {{ p.title }}</div><span class="badge">{{ p.plan_type }}</span></div>
      <p class="text-dim">{{ p.description || '' }}</p>
      <div v-if="p.why" class="mt-8"><span style="color:var(--primary);font-size:12px">💡 {{ p.why }}</span></div>
    </div>
    <div v-if="plans.length===0 && profile?.onboarding_completed" class="empty-state">规划生成中...</div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { profileApi } from '@/api'
const plans = ref<any[]>([])
const profile = ref<any>(null)
onMounted(async () => {
  profile.value = (await profileApi.getProfile()).profile
  const res = await fetch('/api/plans').then(r => r.json())
  plans.value = res.plans || []
})
</script>
<style scoped>
.plans-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.page-header { margin-bottom: 20px; }
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.card-title { font-size: 16px; font-weight: 600; }
.text-dim { color: var(--text-dim); font-size: 13px; }
.mt-8 { margin-top: 8px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; background: rgba(255,107,157,0.2); color: var(--primary); }
.btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; }
.btn-primary { background: var(--primary); color: white; }
.empty-state { text-align: center; padding: 40px; color: var(--text-dim); }
</style>
