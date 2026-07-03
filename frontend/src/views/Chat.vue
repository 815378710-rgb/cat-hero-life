<template>
  <div class="chat-page">
    <div class="chat-header">
      <div class="chat-avatar">🐱</div>
      <div>
        <div class="chat-name">猫猫侠</div>
        <div class="chat-status">你的AI人生管家 · 随时在线</div>
      </div>
    </div>
    
    <div class="chat-messages" ref="messagesRef">
      <div v-for="msg in messages" :key="msg.id" class="message" :class="msg.role">
        <div class="message-avatar">{{ msg.role === 'user' ? '👤' : '🐱' }}</div>
        <div class="message-bubble">{{ msg.content }}</div>
      </div>
      <div v-if="typing" class="message assistant">
        <div class="message-avatar">🐱</div>
        <div class="message-bubble typing">思考中...</div>
      </div>
    </div>
    
    <div class="chat-input-area">
      <input 
        v-model="inputText" 
        class="chat-input" 
        placeholder="和猫猫侠聊天..."
        @keypress.enter="sendMessage"
      />
      <button class="chat-send" @click="sendMessage">
        <i class="fas fa-paper-plane"></i>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { chatApi } from '@/api'
import type { ChatMessage } from '@/types'

const messages = ref<ChatMessage[]>([])
const inputText = ref('')
const typing = ref(false)
const messagesRef = ref<HTMLElement>()

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

const loadHistory = async () => {
  try {
    const res = await chatApi.getHistory(50)
    messages.value = res.messages || []
    scrollToBottom()
  } catch (e) {}
}

const sendMessage = async () => {
  const text = inputText.value.trim()
  if (!text) return
  
  inputText.value = ''
  messages.value.push({
    id: Date.now(),
    user_id: '',
    role: 'user',
    content: text,
    metadata: null,
    created_at: new Date().toISOString()
  })
  scrollToBottom()
  
  typing.value = true
  try {
    const res = await chatApi.send(text)
    messages.value.push({
      id: Date.now() + 1,
      user_id: '',
      role: 'assistant',
      content: res.response,
      metadata: JSON.stringify(res.metadata),
      created_at: new Date().toISOString()
    })
  } catch (e) {
    messages.value.push({
      id: Date.now() + 1,
      user_id: '',
      role: 'assistant',
      content: '抱歉，出了点问题~ 请稍后再试。',
      metadata: null,
      created_at: new Date().toISOString()
    })
  } finally {
    typing.value = false
    scrollToBottom()
  }
}

onMounted(loadHistory)
</script>

<style scoped>
.chat-page { display: flex; flex-direction: column; height: calc(100vh - var(--header-height) - 48px); max-height: 800px; }

.chat-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px; background: var(--bg-card);
  border-radius: 12px 12px 0 0; border: 1px solid var(--border); border-bottom: none;
}
.chat-avatar { width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(135deg, var(--primary), var(--secondary)); display: flex; align-items: center; justify-content: center; font-size: 24px; }
.chat-name { font-weight: 600; }
.chat-status { font-size: 11px; color: var(--text-dim); }

.chat-messages {
  flex: 1; overflow-y: auto; padding: 16px;
  background: var(--bg-card); border-left: 1px solid var(--border); border-right: 1px solid var(--border);
}

.message { display: flex; gap: 10px; margin-bottom: 16px; animation: fadeIn 0.3s; }
.message.user { flex-direction: row-reverse; }
.message-avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.message.assistant .message-avatar { background: linear-gradient(135deg, var(--primary), var(--secondary)); }
.message.user .message-avatar { background: var(--info); }

.message-bubble {
  max-width: 70%; padding: 12px 16px; border-radius: 16px;
  font-size: 14px; line-height: 1.6; white-space: pre-wrap;
}
.message.assistant .message-bubble { background: var(--bg-input); border-bottom-left-radius: 4px; }
.message.user .message-bubble { background: var(--primary); color: white; border-bottom-right-radius: 4px; }
.message-bubble.typing { opacity: 0.7; animation: pulse 1s infinite; }

.chat-input-area {
  display: flex; gap: 8px; padding: 16px;
  background: var(--bg-card); border-radius: 0 0 12px 12px;
  border: 1px solid var(--border); border-top: none;
}
.chat-input {
  flex: 1; padding: 12px 16px; background: var(--bg-input);
  border: 1px solid var(--border); border-radius: 24px;
  color: var(--text); font-size: 14px; outline: none;
}
.chat-input:focus { border-color: var(--primary); }
.chat-send {
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--primary); border: none; color: white;
  font-size: 16px; cursor: pointer; transition: all 0.2s;
}
.chat-send:hover { background: var(--primary-dark); transform: scale(1.05); }

@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
</style>
