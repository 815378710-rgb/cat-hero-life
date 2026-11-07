// 猫猫侠 - 任务状态管理

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Task } from '@/types'
import { taskApi } from '@/api'

export const useTaskStore = defineStore('tasks', () => {
  const tasks = ref<Task[]>([])
  const grouped = ref<Record<string, Task[]>>({ pending: [], in_progress: [], completed: [], failed: [] })
  const loading = ref(false)
  // 服务端会限制单次返回条数（默认 300），总数以服务端为准
  const serverTotal = ref(0)
  const hasMore = ref(false)
  const loadingMore = ref(false)

  const pendingCount = computed(() => grouped.value.pending?.length || 0)
  const completedCount = computed(() => grouped.value.completed?.length || 0)
  const totalCount = computed(() => serverTotal.value || tasks.value.length)

  async function fetchTasks(date?: string) {
    loading.value = true
    try {
      const res = await taskApi.getTasks({ date })
      tasks.value = res.tasks
      grouped.value = res.grouped
      const meta = res as unknown as { total?: number; hasMore?: boolean }
      serverTotal.value = meta.total ?? res.tasks.length
      hasMore.value = !!meta.hasMore
    } catch (e) {
      console.error('Failed to fetch tasks:', e)
    } finally {
      loading.value = false
    }
  }

  async function completeTask(id: string) {
    try {
      const res = await taskApi.completeTask(id)
      if (res.success) {
        await fetchTasks()
      }
      return res
    } catch (e) {
      console.error('Failed to complete task:', e)
      return { success: false, message: '完成失败' }
    }
  }

  async function generateSmart() {
    try {
      const res = await taskApi.generateSmart()
      if (res.success) {
        await fetchTasks()
      }
      return res
    } catch (e) {
      console.error('Failed to generate tasks:', e)
      return { success: false, count: 0 }
    }
  }

  async function createTask(data: Partial<Task>) {
    try {
      const res = await taskApi.createTask(data)
      if (res.success) {
        await fetchTasks()
      }
      return res
    } catch (e) {
      return { success: false }
    }
  }

  // 分页追加：服务端默认单次 300 条，历史任务通过「加载更多」按需取回
  async function loadMoreTasks(date?: string) {
    if (!hasMore.value || loadingMore.value) return
    loadingMore.value = true
    try {
      const res = await taskApi.getTasks({ date, offset: tasks.value.length })
      const seen = new Set(tasks.value.map(t => t.id))
      const fresh = res.tasks.filter(t => !seen.has(t.id))
      tasks.value = [...tasks.value, ...fresh]

      // 分组同步合并（保持四种状态键稳定）
      const next: Record<string, Task[]> = {
        pending: [...(grouped.value.pending || [])],
        in_progress: [...(grouped.value.in_progress || [])],
        completed: [...(grouped.value.completed || [])],
        failed: [...(grouped.value.failed || [])],
      }
      for (const [k, list] of Object.entries(res.grouped || {})) {
        const known = new Set((next[k] || []).map(t => t.id))
        next[k] = [...(next[k] || []), ...(list || []).filter(t => !known.has(t.id))]
      }
      grouped.value = next

      const meta = res as unknown as { total?: number; hasMore?: boolean }
      serverTotal.value = meta.total ?? serverTotal.value
      hasMore.value = !!meta.hasMore && fresh.length > 0
    } catch (e) {
      console.error('Failed to load more tasks:', e)
    } finally {
      loadingMore.value = false
    }
  }

  return {
    tasks, grouped, loading, loadingMore, hasMore,
    pendingCount, completedCount, totalCount,
    fetchTasks, loadMoreTasks, completeTask, generateSmart, createTask
  }
})
