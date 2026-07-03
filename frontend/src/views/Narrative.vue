<template>
  <div class="narrative-page">
    <div class="page-header"><h2>📖 你的人生故事</h2><button class="btn btn-primary" @click="generate">生成新章节</button></div>
    <p class="text-dim mb-16">把你的人生经历编织成故事，你就是自己人生的主角~</p>
    <div v-if="chapters.length===0" class="empty-state"><div style="font-size:64px;margin-bottom:16px">📖</div><h3>还没有故事章节</h3><p class="text-dim mt-8">点击"生成新章节"开始~</p></div>
    <div v-for="c in chapters" :key="c.id" class="chapter-card">
      <div class="chapter-title">第{{ c.chapter_number }}章：{{ c.chapter_title }}</div>
      <div class="chapter-text">{{ c.narrative_text }}</div>
      <div class="chapter-date">{{ c.created_at?.slice(0, 10) }}</div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { narrativeApi } from '@/api'
const chapters = ref<any[]>([])
const load = async () => { chapters.value = (await narrativeApi.getChapters()).chapters || [] }
const generate = async () => {
  const res = await narrativeApi.generate()
  if (res.success) { alert('新章节已生成！'); await load() }
}
onMounted(load)
</script>
<style scoped>
.narrative-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.mb-16 { margin-bottom: 16px; }
.mt-8 { margin-top: 8px; }
.chapter-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 16px; }
.chapter-title { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: var(--primary); }
.chapter-text { font-size: 14px; line-height: 1.8; white-space: pre-wrap; }
.chapter-date { font-size: 11px; color: var(--text-dim); margin-top: 12px; }
.empty-state { text-align: center; padding: 60px; color: var(--text-dim); }
.text-dim { color: var(--text-dim); }
.btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; }
.btn-primary { background: var(--primary); color: white; }
</style>
