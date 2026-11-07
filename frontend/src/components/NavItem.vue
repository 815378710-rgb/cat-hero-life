<template>
  <div class="nav-item" :class="{ active: isActive }" @click="$emit('click', page)">
    <i :class="icon"></i>
    <span>{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{
  page: string
  icon: string
  label: string
}>()

defineEmits(['click'])

const route = useRoute()
const isActive = computed(() => route.name === props.page)
</script>

<style scoped>
.nav-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; border-radius: 8px;
  cursor: pointer; transition: all 0.2s;
  color: var(--text-dim); font-size: 14px;
}
.nav-item:hover { background: var(--bg-card-hover); color: var(--text); }
.nav-item.active { background: rgba(255,107,157,0.15); color: var(--primary); }
.nav-item i { width: 20px; text-align: center; font-size: 16px; }
</style>
