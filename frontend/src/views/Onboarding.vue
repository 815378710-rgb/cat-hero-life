<template>
  <div class="onboarding-page">
    <div class="card">
      <div class="card-header">
        <div class="card-title">🐱 猫猫侠想了解你</div>
        <span class="text-dim">第 {{ step + 1 }} 步 / 共 10 步</span>
      </div>
      <div class="progress-bar mb-16"><div class="progress-fill" :style="{ width: (step * 10) + '%' }"></div></div>
      <div class="chat-messages" ref="messagesRef">
        <div v-for="msg in messages" :key="msg.id" class="message" :class="msg.role">
          <div class="message-avatar">{{ msg.role === 'user' ? '👤' : '🐱' }}</div>
          <div class="message-bubble">{{ msg.content }}</div>
        </div>
      </div>
      <div class="chat-input-area">
        <input v-model="inputText" class="chat-input" placeholder="和猫猫侠聊天，自然地介绍自己..." @keypress.enter="send" />
        <button class="chat-send" @click="send"><i class="fas fa-paper-plane"></i></button>
      </div>
      <div class="mt-8"><button class="btn btn-secondary btn-sm" @click="skip">跳过建档</button></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { onboardingApi } from '@/api'
const router = useRouter()
const messages = ref<any[]>([])
const inputText = ref('')
const step = ref(0)
const messagesRef = ref<HTMLElement>()
const scroll = () => nextTick(() => { if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight })
const addMsg = (role: string, content: string) => { messages.value.push({ id: Date.now() + Math.random(), role, content }); scroll() }
onMounted(async () => {
  const res = await onboardingApi.start()
  if (res.completed) { router.push('/'); return }
  addMsg('assistant', res.message)
  step.value = res.step
})
const send = async () => {
  const text = inputText.value.trim()
  if (!text) return
  inputText.value = ''
  addMsg('user', text)
  const res = await onboardingApi.chat(text)
  addMsg('assistant', res.response)
  step.value = res.step
  if (res.completed) { setTimeout(() => router.push('/'), 2000) }
}
const skip = async () => {
  if (!confirm('确定跳过建档吗？')) return
  await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ onboarding_completed: 1, onboarding_step: 10 }) })
  router.push('/')
}
</script>
<style scoped>
.onboarding-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.card-title { font-size: 16px; font-weight: 600; }
.mb-16 { margin-bottom: 16px; }
.mt-8 { margin-top: 8px; }
.progress-bar { height: 8px; background: var(--bg-input); border-radius: 4px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, var(--primary), var(--secondary)); }
.chat-messages { min-height: 300px; max-height: 400px; overflow-y: auto; padding: 16px; background: var(--bg-input); border-radius: 12px; margin-bottom: 16px; }
.message { display: flex; gap: 10px; margin-bottom: 16px; }
.message.user { flex-direction: row-reverse; }
.message-avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.message.assistant .message-avatar { background: linear-gradient(135deg, var(--primary), var(--secondary)); }
.message.user .message-avatar { background: var(--info); }
.message-bubble { max-width: 70%; padding: 12px 16px; border-radius: 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
.message.assistant .message-bubble { background: var(--bg-card); border-bottom-left-radius: 4px; }
.message.user .message-bubble { background: var(--primary); color: white; border-bottom-right-radius: 4px; }
.chat-input-area { display: flex; gap: 8px; }
.chat-input { flex: 1; padding: 12px 16px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 24px; color: var(--text); font-size: 14px; outline: none; }
.chat-input:focus { border-color: var(--primary); }
.chat-send { width: 44px; height: 44px; border-radius: 50%; background: var(--primary); border: none; color: white; font-size: 16px; cursor: pointer; }
.btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; }
.btn-secondary { background: var(--bg-card-hover); color: var(--text); border: 1px solid var(--border); }
.btn-sm { padding: 6px 12px; font-size: 12px; }
.text-dim { color: var(--text-dim); font-size: 13px; }
</style>
