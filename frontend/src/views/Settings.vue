<template>
  <div class="settings-page">
    <h2 style="margin-bottom:20px">⚙️ 设置</h2>
    
    <div class="settings-section">
      <h3>🤖 AI大脑配置</h3>
      <p class="text-dim mb-8">接入大模型API，让猫猫侠真正"活"起来</p>
      <div class="input-group"><label>AI提供商</label>
        <select v-model="aiForm.provider" class="input"><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="qwen">通义千问</option><option value="claude">Claude</option></select>
      </div>
      <div class="input-group"><label>API Key</label><input v-model="aiForm.apiKey" type="password" class="input" placeholder="sk-xxx" /></div>
      <div class="input-group"><label>模型（留空使用默认）</label><input v-model="aiForm.model" class="input" placeholder="例如：deepseek-chat" /></div>
      <div style="display:flex;gap:8px"><button class="btn btn-primary" @click="saveAi">保存</button><span class="text-dim" id="ai-status">{{ aiEnabled ? '✅ 已启用' : '❌ 未配置' }}</span></div>
    </div>
    
    <div class="settings-section">
      <h3>🐱 AI管家性格</h3>
      <div class="personality-grid">
        <div v-for="p in personalities" :key="p.type" class="personality-card" :class="{ active: currentPersonality === p.type }" @click="setPersonality(p.type)">
          <div class="p-icon">{{ p.icon }}</div>
          <div class="p-name">{{ p.name }}</div>
          <div class="p-desc">{{ p.desc }}</div>
        </div>
      </div>
    </div>
    
    <div class="settings-section">
      <h3>👤 用户信息</h3>
      <div class="input-group"><label>昵称</label><input v-model="username" class="input" /></div>
      <button class="btn btn-primary" @click="saveUsername">保存</button>
    </div>
    
    <div class="settings-section">
      <h3>💰 财务设置</h3>
      <div class="grid-2">
        <div class="input-group"><label>月收入</label><input v-model.number="finForm.income" type="number" class="input" /></div>
        <div class="input-group"><label>月预算</label><input v-model.number="finForm.budget" type="number" class="input" /></div>
      </div>
      <button class="btn btn-primary" @click="saveFin">保存</button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { aiConfigApi } from '@/api'
const userStore = useUserStore()
const aiForm = ref({ provider: 'deepseek', apiKey: '', model: '' })
const aiEnabled = ref(false)
const username = ref('')
const finForm = ref({ income: 0, budget: 0 })
const currentPersonality = ref('encouraging')
const personalities = [
  { type: 'encouraging', icon: '🥰', name: '温柔鼓励型', desc: '温暖、支持、肯定' },
  { type: 'strict', icon: '😤', name: '严厉教练型', desc: '直接、严肃、Push' },
  { type: 'funny', icon: '😈', name: '毒舌损友型', desc: '吐槽、调侃、激将' },
]
onMounted(async () => {
  const cfg = await aiConfigApi.getConfig()
  aiEnabled.value = cfg.enabled
  username.value = userStore.username
  currentPersonality.value = userStore.user?.personality_type || 'encouraging'
})
const saveAi = async () => {
  await aiConfigApi.updateConfig(aiForm.value)
  aiEnabled.value = true
  alert('AI配置已保存')
}
const setPersonality = async (type: string) => {
  await fetch('/api/chat/personality', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) })
  currentPersonality.value = type
}
const saveUsername = async () => {
  await userStore.updateProfile({ username: username.value } as any)
  alert('昵称已保存')
}
const saveFin = async () => {
  await userStore.updateProfile({ monthly_income: finForm.value.income, monthly_budget: finForm.value.budget } as any)
  alert('财务设置已保存')
}
</script>
<style scoped>
.settings-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.settings-section { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 16px; }
.settings-section h3 { font-size: 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.text-dim { color: var(--text-dim); font-size: 13px; }
.mb-8 { margin-bottom: 8px; }
.input-group { margin-bottom: 16px; }
.input-group label { display: block; font-size: 12px; color: var(--text-dim); margin-bottom: 6px; }
.input { width: 100%; padding: 10px 14px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 14px; outline: none; }
.input:focus { border-color: var(--primary); }
.personality-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.personality-card { padding: 16px; background: var(--bg-input); border: 2px solid var(--border); border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s; }
.personality-card.active { border-color: var(--primary); background: rgba(255,107,157,0.1); }
.personality-card:hover { border-color: var(--primary); }
.p-icon { font-size: 32px; margin-bottom: 8px; }
.p-name { font-size: 14px; font-weight: 600; }
.p-desc { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; }
.btn-primary { background: var(--primary); color: white; }
</style>
