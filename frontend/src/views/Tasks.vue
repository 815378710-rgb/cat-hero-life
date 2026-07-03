<template>
  <div class="tasks-page">
    <div class="page-header">
      <h2>📋 任务中心</h2>
      <div class="header-actions">
        <button class="btn btn-primary" @click="generateSmart">
          <i class="fas fa-magic"></i> 智能生成
        </button>
        <button class="btn btn-secondary" @click="showCreate = true">
          <i class="fas fa-plus"></i> 新建
        </button>
      </div>
    </div>

    <!-- Task Groups -->
    <div v-for="(tasks, status) in grouped" :key="status" class="task-group" v-show="tasks.length > 0">
      <h3 class="group-title">
        {{ statusIcons[status] }} {{ statusLabels[status] }} ({{ tasks.length }})
      </h3>
      <div v-for="task in tasks" :key="task.id" class="task-item" :class="{ completed: status === 'completed' }">
        <div class="task-check" :class="{ done: status === 'completed' }" @click="completeTask(task.id)">
          {{ status === 'completed' ? '✓' : '' }}
        </div>
        <div class="task-content">
          <div class="task-title">{{ task.dimension_icon || '📋' }} {{ task.title }}</div>
          <div class="task-meta">
            <span class="badge" :class="'badge-' + task.difficulty">{{ task.difficulty }}</span>
            <span>{{ task.dimension_name || '' }}</span>
            <span>+{{ task.exp_reward }}EXP +{{ task.coin_reward }}🪙</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="totalTasks === 0" class="empty-state">
      <div class="empty-icon">📋</div>
      <p>还没有任务</p>
      <button class="btn btn-primary" @click="generateSmart">生成今日任务</button>
    </div>

    <!-- Create Task Modal -->
    <div v-if="showCreate" class="modal-overlay active" @click="showCreate = false">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>新建任务</h3>
          <button class="btn-icon" @click="showCreate = false"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <div class="input-group">
            <label>任务名称</label>
            <input v-model="newTask.title" class="input" placeholder="输入任务名称" />
          </div>
          <div class="input-group">
            <label>维度</label>
            <select v-model="newTask.dimension_id" class="input">
              <option value="health">🏋️ 健康</option>
              <option value="finance">💰 财务</option>
              <option value="learning">📚 学习</option>
              <option value="career">💼 职业</option>
              <option value="social">❤️ 社交</option>
              <option value="mental">🧘 心理</option>
              <option value="habits">🎯 习惯</option>
              <option value="creativity">🎨 创造</option>
            </select>
          </div>
          <div class="input-group">
            <label>难度</label>
            <select v-model="newTask.difficulty" class="input">
              <option value="easy">简单 (10EXP 5🪙)</option>
              <option value="medium">中等 (20EXP 10🪙)</option>
              <option value="hard">困难 (40EXP 20🪙)</option>
            </select>
          </div>
          <button class="btn btn-primary" style="width:100%" @click="createTask">创建任务</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTaskStore } from '@/stores/tasks'
import type { Task } from '@/types'

const taskStore = useTaskStore()
const showCreate = ref(false)
const newTask = ref({ title: '', dimension_id: 'health', difficulty: 'medium' })

const grouped = computed(() => taskStore.grouped)
const totalTasks = computed(() => taskStore.totalCount)

const statusIcons: Record<string, string> = { pending: '⏳', in_progress: '🔄', completed: '✅', failed: '❌' }
const statusLabels: Record<string, string> = { pending: '待完成', in_progress: '进行中', completed: '已完成', failed: '已失败' }

const generateSmart = async () => {
  await taskStore.generateSmart()
}

const completeTask = async (id: string) => {
  await taskStore.completeTask(id)
}

const createTask = async () => {
  if (!newTask.value.title.trim()) return
  await taskStore.createTask({
    title: newTask.value.title,
    dimension_id: newTask.value.dimension_id,
    difficulty: newTask.value.difficulty as any,
    scheduled_date: new Date().toISOString().split('T')[0]
  })
  showCreate.value = false
  newTask.value = { title: '', dimension_id: 'health', difficulty: 'medium' }
}

onMounted(() => taskStore.fetchTasks())
</script>

<style scoped>
.tasks-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { font-size: 24px; }
.header-actions { display: flex; gap: 8px; }

.task-group { margin-bottom: 24px; }
.group-title { font-size: 14px; color: var(--text-dim); margin-bottom: 12px; }

.task-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; background: var(--bg-card);
  border: 1px solid var(--border); border-radius: 8px;
  margin-bottom: 8px; transition: all 0.2s;
}
.task-item:hover { border-color: rgba(255,107,157,0.3); }
.task-item.completed { opacity: 0.6; }
.task-item.completed .task-title { text-decoration: line-through; }

.task-check {
  width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid var(--border); display: flex;
  align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.2s; flex-shrink: 0;
}
.task-check:hover { border-color: var(--success); background: rgba(76,175,80,0.2); }
.task-check.done { background: var(--success); border-color: var(--success); color: white; }

.task-content { flex: 1; }
.task-title { font-size: 14px; font-weight: 500; }
.task-meta { font-size: 11px; color: var(--text-dim); margin-top: 4px; display: flex; gap: 8px; }

.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; }
.badge-easy { background: rgba(76,175,80,0.2); color: var(--success); }
.badge-medium { background: rgba(255,152,0,0.2); color: var(--warning); }
.badge-hard { background: rgba(244,67,54,0.2); color: var(--danger); }

.empty-state { text-align: center; padding: 60px 20px; color: var(--text-dim); }
.empty-icon { font-size: 64px; margin-bottom: 16px; }

.btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s; display: inline-flex; align-items: center; gap: 8px; }
.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-dark); }
.btn-secondary { background: var(--bg-card-hover); color: var(--text); border: 1px solid var(--border); }
.btn-sm { padding: 6px 12px; font-size: 12px; }

.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 200; align-items: center; justify-content: center; }
.modal-overlay.active { display: flex; }
.modal { background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border); width: 90%; max-width: 500px; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.modal-body { padding: 20px; }

.input-group { margin-bottom: 16px; }
.input-group label { display: block; font-size: 12px; color: var(--text-dim); margin-bottom: 6px; }
.input { width: 100%; padding: 10px 14px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 14px; outline: none; }
.input:focus { border-color: var(--primary); }

.btn-icon { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 18px; padding: 8px; }
</style>
