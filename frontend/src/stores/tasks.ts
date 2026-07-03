// 猫猫侠 - 任务状态管理

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Task } from '@/types'
import { taskApi } from '@/api'

export const useTaskStore = defineStore('tasks', () => {
  const tasks = ref<Task[]>([])
  const grouped = ref<Record<string, Task[]>>({ pending: [], in_progress: [], completed: [], failed: [] })
  const loading = ref(false)

  const pendingCount = computed(() => grouped.value.pending?.length || 0)
  const completedCount = computed(() => grouped.value.completed?.length || 0)
  const totalCount = computed(() => tasks.value.length)

  async function fetchTasks(date?: string) {
    loading.value = true
    try {
      const res = await taskApi.getTasks({ date })
      tasks.value = res.tasks
      grouped.value = res.grouped
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

  return {
    tasks, grouped, loading,
    pendingCount, completedCount, totalCount,
    fetchTasks, completeTask, generateSmart, createTask
  }
})
