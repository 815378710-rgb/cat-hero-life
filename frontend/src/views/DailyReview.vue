<template>
  <div class="review-page">
    <div class="page-header">
      <h2>📝 每日复盘</h2>
    </div>

    <!-- Progress Bar -->
    <div class="progress-bar-wrap">
      <div class="progress-steps">
        <div
          v-for="step in steps"
          :key="step.id"
          class="step-dot"
          :class="{ active: step.id <= currentStep, done: step.id < currentStep }"
        ></div>
      </div>
      <div class="progress-label">{{ steps[currentStep - 1]?.label }}</div>
    </div>

    <!-- Step 1: Mood -->
    <template v-if="currentStep === 1">
      <div class="card step-card">
        <div class="step-question">今天感觉怎么样？</div>
        <div class="mood-grid">
          <button
            v-for="mood in moods"
            :key="mood.emoji"
            class="mood-btn"
            :class="{ selected: review.mood === mood.emoji }"
            @click="review.mood = mood.emoji"
          >
            <span class="mood-emoji">{{ mood.emoji }}</span>
            <span class="mood-label">{{ mood.label }}</span>
          </button>
        </div>
        <button class="btn btn-primary action-btn" @click="nextStep" :disabled="!review.mood">
          下一步 →
        </button>
      </div>
    </template>

    <!-- Step 2: Completed Tasks -->
    <template v-if="currentStep === 2">
      <div class="card step-card">
        <div class="step-question">今天完成了什么？</div>
        <div v-if="tasks.length > 0" class="task-list">
          <div
            v-for="task in tasks"
            :key="task.id"
            class="review-task"
            :class="{ checked: completedTasks.has(task.id) }"
            @click="toggleTask(task.id)"
          >
            <span class="task-check">{{ completedTasks.has(task.id) ? '✅' : '⬜' }}</span>
            <span class="task-title">{{ task.title }}</span>
          </div>
        </div>
        <div v-else class="empty-mini">今天暂无任务记录</div>
        <div class="input-group">
          <label>补充笔记</label>
          <textarea
            v-model="review.notes"
            class="input textarea"
            placeholder="记录今天的收获或感想..."
            rows="3"
          ></textarea>
        </div>
        <div class="step-actions">
          <button class="btn btn-secondary" @click="prevStep">← 上一步</button>
          <button class="btn btn-primary" @click="nextStep">下一步 →</button>
        </div>
      </div>
    </template>

    <!-- Step 3: Improvements -->
    <template v-if="currentStep === 3">
      <div class="card step-card">
        <div class="step-question">有什么想改进的？</div>
        <div class="input-group">
          <textarea
            v-model="review.improvements"
            class="input textarea"
            placeholder="反思今天的不足和改进点..."
            rows="4"
          ></textarea>
        </div>
        <div class="step-actions">
          <button class="btn btn-secondary" @click="prevStep">← 上一步</button>
          <button class="btn btn-primary" @click="nextStep">下一步 →</button>
        </div>
      </div>
    </template>

    <!-- Step 4: Tomorrow Plan -->
    <template v-if="currentStep === 4">
      <div class="card step-card">
        <div class="step-question">明天计划做什么？</div>
        <div class="tomorrow-tasks">
          <div v-for="(task, i) in review.tomorrowTasks" :key="i" class="tomorrow-task-item">
            <span class="tomorrow-num">{{ i + 1 }}</span>
            <input
              v-model="review.tomorrowTasks[i]"
              class="input"
              :placeholder="`任务 ${i + 1}`"
            />
            <button class="btn-icon" @click="removeTomorrowTask(i)" v-if="review.tomorrowTasks.length > 1">✕</button>
          </div>
        </div>
        <button class="btn btn-sm btn-secondary" @click="addTomorrowTask" style="margin-bottom:16px">+ 添加任务</button>
        <div class="step-actions">
          <button class="btn btn-secondary" @click="prevStep">← 上一步</button>
          <button class="btn btn-primary" @click="submitReview" :disabled="submitting">
            {{ submitting ? '提交中...' : '提交复盘' }}
          </button>
        </div>
      </div>
    </template>

    <!-- Summary -->
    <template v-if="currentStep === 5">
      <div class="card summary-card">
        <div class="summary-header">🎉 复盘完成！</div>
        <div class="summary-mood">
          <span>今日心情：</span>
          <span class="summary-mood-emoji">{{ review.mood }}</span>
        </div>
        <div v-if="completedTasks.size > 0" class="summary-section">
          <div class="summary-label">完成事项</div>
          <div class="summary-text">{{ completedTasks.size }} 项任务</div>
        </div>
        <div v-if="review.notes" class="summary-section">
          <div class="summary-label">笔记</div>
          <div class="summary-text">{{ review.notes }}</div>
        </div>
        <div v-if="review.improvements" class="summary-section">
          <div class="summary-label">改进</div>
          <div class="summary-text">{{ review.improvements }}</div>
        </div>
        <div v-if="review.tomorrowTasks[0]" class="summary-section">
          <div class="summary-label">明日计划</div>
          <div class="summary-text">{{ review.tomorrowTasks.filter(Boolean).join('、') }}</div>
        </div>

        <!-- AI Feedback -->
        <div v-if="aiFeedback" class="ai-feedback">
          <div class="ai-feedback-header">
            <span>🤖 AI 反馈</span>
          </div>
          <div class="ai-feedback-text">{{ aiFeedback }}</div>
        </div>

        <button class="btn btn-primary action-btn" @click="resetReview">开始新的复盘 →</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'

const steps = [
  { id: 1, label: '心情' },
  { id: 2, label: '完成' },
  { id: 3, label: '反思' },
  { id: 4, label: '计划' }
]

const moods = [
  { emoji: '😊', label: '开心' },
  { emoji: '😐', label: '一般' },
  { emoji: '😢', label: '难过' },
  { emoji: '😡', label: '生气' },
  { emoji: '🤩', label: '兴奋' },
  { emoji: '😴', label: '疲惫' }
]

const currentStep = ref(1)
const submitting = ref(false)
const tasks = ref<any[]>([])
const completedTasks = ref(new Set<string>())
const aiFeedback = ref('')

const review = reactive({
  mood: '',
  notes: '',
  improvements: '',
  tomorrowTasks: ['']
})

const nextStep = () => {
  if (currentStep.value < 5) currentStep.value++
}
const prevStep = () => {
  if (currentStep.value > 1) currentStep.value--
}

const toggleTask = (id: string) => {
  if (completedTasks.value.has(id)) {
    completedTasks.value.delete(id)
  } else {
    completedTasks.value.add(id)
  }
  completedTasks.value = new Set(completedTasks.value)
}

const addTomorrowTask = () => {
  review.tomorrowTasks.push('')
}
const removeTomorrowTask = (i: number) => {
  review.tomorrowTasks.splice(i, 1)
}

const loadTasks = async () => {
  try {
    const res = await fetch('/api/tasks?status=completed&date=today')
    const data = await res.json()
    tasks.value = data.tasks || []
  } catch (e) {
    // silently fail
  }
}

const submitReview = async () => {
  submitting.value = true
  try {
    const payload = {
      mood: review.mood,
      notes: review.notes,
      improvements: review.improvements,
      completed_tasks: [...completedTasks.value],
      tomorrow_tasks: review.tomorrowTasks.filter(Boolean)
    }

    // Start review
    await fetch('/api/daily-review/start', { method: 'POST' })

    // Submit answers
    await fetch('/api/daily-review/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    // Complete and get feedback
    const completedRes = await fetch('/api/daily-review/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const result = await completedRes.json()
    aiFeedback.value = result.feedback || result.message || '复盘已保存，明天继续加油！'

    currentStep.value = 5
    showToast('复盘提交成功！')
  } catch (e) {
    showToast('提交失败，请重试')
  }
  submitting.value = false
}

const resetReview = () => {
  review.mood = ''
  review.notes = ''
  review.improvements = ''
  review.tomorrowTasks = ['']
  completedTasks.value = new Set()
  aiFeedback.value = ''
  currentStep.value = 1
}

const showToast = (msg: string) => {
  const el = document.createElement('div')
  el.className = 'toast toast-success'
  el.textContent = msg
  document.getElementById('toast-container')?.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

onMounted(loadTasks)
</script>

<style scoped>
.review-page { animation: fadeIn 0.3s; max-width: 600px; margin: 0 auto; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.page-header { margin-bottom: 20px; }
.page-header h2 { margin: 0; }

/* Progress Bar */
.progress-bar-wrap { margin-bottom: 24px; text-align: center; }
.progress-steps { display: flex; justify-content: center; gap: 12px; margin-bottom: 8px; }
.step-dot {
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--bg-input); border: 2px solid var(--border);
  transition: all 0.3s;
}
.step-dot.active { border-color: var(--primary); background: var(--primary); }
.step-dot.done { background: var(--primary); border-color: var(--primary); opacity: 0.5; }
.progress-label { font-size: 12px; color: var(--text-dim); }

/* Step Cards */
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
.step-card { animation: slideUp 0.3s; }
@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.step-question { font-size: 18px; font-weight: 600; margin-bottom: 20px; }

/* Mood Grid */
.mood-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
.mood-btn {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 16px; border-radius: 12px; border: 2px solid var(--border);
  background: var(--bg-input); color: var(--text); cursor: pointer;
  transition: all 0.2s; font-size: 13px;
}
.mood-btn:hover { border-color: var(--primary); }
.mood-btn.selected { border-color: var(--primary); background: rgba(103, 58, 183, 0.08); }
.mood-emoji { font-size: 32px; }
.mood-label { font-size: 12px; color: var(--text-dim); }

.action-btn { width: 100%; margin-top: 12px; }

/* Task List */
.task-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.review-task {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px;
  border-radius: 8px; background: var(--bg-input); cursor: pointer;
  transition: background 0.2s;
}
.review-task:hover { background: var(--bg-card); }
.review-task.checked { opacity: 0.7; }
.review-task.checked .task-title { text-decoration: line-through; }
.task-check { font-size: 16px; }
.task-title { font-size: 14px; }

/* Tomorrow Tasks */
.tomorrow-tasks { display: flex; flex-direction: column; gap: 10px; margin-bottom: 8px; }
.tomorrow-task-item { display: flex; align-items: center; gap: 10px; }
.tomorrow-num {
  width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: var(--primary); color: white; font-size: 12px; flex-shrink: 0;
}

/* Inputs */
.input-group { margin-bottom: 16px; }
.input-group label { display: block; font-size: 12px; color: var(--text-dim); margin-bottom: 6px; }
.input {
  width: 100%; padding: 10px 14px; background: var(--bg-input);
  border: 1px solid var(--border); border-radius: 8px; color: var(--text);
  font-size: 14px; outline: none; box-sizing: border-box;
}
.input:focus { border-color: var(--primary); }
.textarea { resize: vertical; font-family: inherit; }

.step-actions { display: flex; gap: 10px; margin-top: 8px; }
.step-actions .btn { flex: 1; }

/* Summary */
.summary-card { text-align: left; animation: slideUp 0.4s; }
.summary-header { font-size: 20px; font-weight: 700; text-align: center; margin-bottom: 20px; }
.summary-mood { font-size: 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.summary-mood-emoji { font-size: 28px; }
.summary-section { padding: 12px; background: var(--bg-input); border-radius: 8px; margin-bottom: 10px; }
.summary-label { font-size: 12px; color: var(--text-dim); margin-bottom: 4px; }
.summary-text { font-size: 14px; }

.ai-feedback {
  margin-top: 16px; padding: 16px;
  background: linear-gradient(135deg, rgba(103, 58, 183, 0.08), rgba(33, 150, 243, 0.08));
  border: 1px solid rgba(103, 58, 183, 0.2); border-radius: 12px;
}
.ai-feedback-header { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
.ai-feedback-text { font-size: 13px; color: var(--text-dim); line-height: 1.6; }

.btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s; }
.btn-primary { background: var(--primary); color: white; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: var(--bg-input); color: var(--text); border: 1px solid var(--border); }
.btn-secondary:hover { border-color: var(--primary); }
.btn-sm { padding: 6px 14px; font-size: 12px; }
.btn-icon { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 16px; padding: 4px 8px; }

.empty-mini { text-align: center; padding: 20px; color: var(--text-dim); font-size: 13px; margin-bottom: 16px; }
</style>
