<template>
  <Teleport to="body">
    <div class="toast-container" v-if="toasts.length > 0">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          :class="['toast', `toast-${toast.type}`]"
          @click="remove(toast.id)"
        >
          <span class="toast-icon">{{ toast.icon }}</span>
          <span class="toast-msg">{{ toast.message }}</span>
          <span class="toast-close">✕</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useToast } from '@/composables/useToast'
const { toasts, remove } = useToast()
</script>

<style scoped>
.toast-enter-active { animation: slideInRight 0.3s ease; }
.toast-leave-active { animation: fadeIn 0.2s ease reverse; }
.toast-move { transition: transform 0.3s ease; }
.toast-close { opacity: 0.6; cursor: pointer; margin-left: auto; font-size: 12px; }
.toast-close:hover { opacity: 1; }
</style>
