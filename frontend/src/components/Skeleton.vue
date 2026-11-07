<template>
  <div class="skeleton-wrapper">
    <div v-if="type === 'card'" class="skeleton skeleton-card" :style="{ height }"></div>
    <div v-else-if="type === 'text'" class="skeleton skeleton-text" :style="{ width }"></div>
    <div v-else-if="type === 'title'" class="skeleton skeleton-title"></div>
    <div v-else-if="type === 'circle'" class="skeleton skeleton-circle" :style="{ width: size, height: size }"></div>
    <div v-else-if="type === 'list'">
      <div v-for="i in count" :key="i" class="skeleton-list-item" :style="{ animationDelay: i * 0.05 + 's' }">
        <div class="skeleton skeleton-circle" style="width:40px;height:40px"></div>
        <div style="flex:1">
          <div class="skeleton skeleton-text" style="width:70%"></div>
          <div class="skeleton skeleton-text short" style="width:40%"></div>
        </div>
      </div>
    </div>
    <div v-else-if="type === 'chart'" class="skeleton skeleton-chart" :style="{ height }"></div>
    <div v-else class="skeleton" :style="{ height, width }"></div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  type?: 'card' | 'text' | 'title' | 'circle' | 'list' | 'chart' | 'block'
  height?: string
  width?: string
  size?: string
  count?: number
}>()
</script>

<style scoped>
.skeleton-wrapper { animation: fadeIn 0.3s; }
.skeleton-list-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0; border-bottom: 1px solid var(--border);
  animation: fadeInUp 0.3s ease both;
}
</style>
