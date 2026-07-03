<template>
  <div class="memory-page">
    <div class="page-header"><h2>🧠 猫猫侠的记忆</h2></div>
    <p class="text-dim mb-16">我会记住你的每一次对话、每一个决定、每一个里程碑~</p>
    <div v-if="memories.length===0" class="empty-state">还没有记忆，多和我聊天就会有了~ 🐱</div>
    <div v-for="m in memories" :key="m.id" class="memory-item">
      <div class="memory-icon">{{ icons[m.memory_type] || '📝' }}</div>
      <div class="memory-content">
        <div class="memory-title">{{ m.title }}</div>
        <div class="memory-summary">{{ m.summary || m.content?.slice(0, 80) || '' }}</div>
        <div class="memory-meta">{{ m.created_at?.slice(0, 10) }}</div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { memoryApi } from '@/api'
const memories = ref<any[]>([])
const icons: Record<string, string> = { conversation: '💬', event: '📅', insight: '💡', decision: '🔀', milestone: '⭐', emotion: '🎭' }
onMounted(async () => { memories.value = (await memoryApi.getMemories(30)).memories || [] })
</script>
<style scoped>
.memory-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.page-header { margin-bottom: 16px; }
.mb-16 { margin-bottom: 16px; }
.memory-item { display: flex; gap: 12px; padding: 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; }
.memory-icon { font-size: 20px; }
.memory-content { flex: 1; }
.memory-title { font-size: 14px; font-weight: 500; }
.memory-summary { font-size: 12px; color: var(--text-dim); margin-top: 4px; }
.memory-meta { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
.empty-state { text-align: center; padding: 40px; color: var(--text-dim); }
.text-dim { color: var(--text-dim); font-size: 13px; }
</style>
