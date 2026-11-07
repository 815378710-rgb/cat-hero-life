// 猫猫侠 - Toast通知系统
import { ref } from 'vue'

export interface Toast {
  id: number
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration: number
  icon?: string
}

const toasts = ref<Toast[]>([])
let nextId = 0

const icons: Record<string, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
}

export function useToast() {
  function show(message: string, type: Toast['type'] = 'info', duration = 3000) {
    const id = nextId++
    const toast: Toast = { id, type, message, duration, icon: icons[type] }
    toasts.value.push(toast)

    if (duration > 0) {
      setTimeout(() => remove(id), duration)
    }
    return id
  }

  function success(message: string, duration?: number) { return show(message, 'success', duration) }
  function error(message: string, duration?: number) { return show(message, 'error', duration || 5000) }
  function warning(message: string, duration?: number) { return show(message, 'warning', duration) }
  function info(message: string, duration?: number) { return show(message, 'info', duration) }

  function remove(id: number) {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx >= 0) toasts.value.splice(idx, 1)
  }

  function clear() { toasts.value = [] }

  return { toasts, show, success, error, warning, info, remove, clear }
}
