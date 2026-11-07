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
    
    <div v-if="pickedImages.length" class="chat-previews">
      <div v-for="(img, i) in pickedImages" :key="i" class="chat-preview">
        <img :src="img" class="chat-preview-img" alt="预览" />
        <span class="chat-preview-del" @click="removeImage(i)">×</span>
      </div>
    </div>

    <div class="chat-input-area">
      <button class="chat-img-btn" title="发送图片" @click="pickImage">
        <i class="fas fa-image"></i>
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        style="display: none"
        @change="onFilesPicked"
      />
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
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { chatApi } from '@/api'
import type { ChatMessage } from '@/types'

const messages = ref<ChatMessage[]>([])
const inputText = ref('')
const typing = ref(false)
const messagesRef = ref<HTMLElement>()
// 待发送的图片（base64 dataURL），最多 4 张
const pickedImages = ref<string[]>([])
const fileInput = ref<HTMLInputElement>()
let pollTimer: ReturnType<typeof setInterval> | null = null

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

// 本地乐观消息用 Date.now() 当 id，服务端用自增整数 id，二者永不相等，
// 只按 id 去重会把同一条消息重复插入（表现为"发一条显示两条"）。
// 因此：本地乐观消息打 __local 标记，并用 role|content 作为比对键；
// 一旦服务端历史里出现同内容的条目，就用服务端版本替换本地乐观副本。
const messageKey = (m: ChatMessage) => `${m.role}|${m.content}`

// 流式结束/失败时收口：转为服务端语义（不再被轮询替换），空气泡直接丢弃
const settleStreamMsg = (m: ChatMessage) => {
  ;(m as any).__local = 0
  if (!m.content) {
    messages.value = messages.value.filter(x => x !== m)
  }
}

let sending = false

const pickImage = () => fileInput.value?.click()

// 读取 + 压缩：手机原图动辄几 MB，base64 后会撑爆请求体，统一压到 1280px / JPEG 0.82
const onFilesPicked = (e: Event) => {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || []).slice(0, 4)
  files.forEach(file => {
    if (!/^image\//.test(file.type)) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const MAX = 1280
        let w = img.width
        let h = img.height
        if (w > MAX || h > MAX) {
          const s = Math.min(MAX / w, MAX / h)
          w = Math.round(w * s)
          h = Math.round(h * s)
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')?.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        if (pickedImages.value.length < 4) pickedImages.value.push(dataUrl)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
  input.value = ''
}

const removeImage = (i: number) => pickedImages.value.splice(i, 1)

const loadHistory = async (silent = false) => {
  try {
    if (sending) return // 流式进行中不打扰，避免打断正在渲染的回复
    const res = await chatApi.getHistory(50)
    const serverMessages = res.messages || []
    
    if (messages.value.length > 0) {
      // 1) 移除「本地乐观副本」中已被服务端落库的那条
      const serverKeys = new Set(serverMessages.map(m => messageKey(m)))
      messages.value = messages.value.filter(
        m => !(m as any).__local || !serverKeys.has(messageKey(m))
      )
      // 2) 按服务端 id 追加真正的新消息
      const existingIds = new Set(messages.value.map(m => m.id))
      const newMsgs = serverMessages.filter(m => !existingIds.has(m.id))
      if (newMsgs.length > 0) {
        messages.value.push(...newMsgs)
        scrollToBottom()
      }
    } else {
      messages.value = serverMessages
      scrollToBottom()
    }
  } catch (e) {}
}

const sendMessage = async () => {
  if (sending) return // 防重复提交（连点/回车双击）
  const text = inputText.value.trim()
  const imgs = pickedImages.value.slice()
  if (!text && !imgs.length) return
  
  sending = true
  inputText.value = ''
  pickedImages.value = []
  messages.value.push({
    id: Date.now(),
    user_id: '',
    role: 'user' as const,
    content: text || '（图片）',
    metadata: null,
    created_at: new Date().toISOString(),
    ...({ __local: 1 } as any)
  })
  scrollToBottom()
  
  typing.value = true
  
  // 创建AI回复消息（流式更新）
  const aiMsg: ChatMessage = {
    id: Date.now() + 1,
    user_id: '',
    role: 'assistant',
    content: '',
    metadata: null,
    created_at: new Date().toISOString(),
    ...({ __local: 1 } as any)
  }
  messages.value.push(aiMsg)
  
  try {
    // 使用SSE流式输出
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, images: imgs })
    })
    
    if (!response.ok) throw new Error('Stream request failed')
    
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    
    if (!reader) throw new Error('No reader available')
    
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      
      for (const line of lines) {
        if (line.startsWith('data:')) {
          try {
            const data = JSON.parse(line.slice(5).trim())
            
            if (data.type === 'message') {
              // 追加内容（流式更新）
              aiMsg.content += data.content
              scrollToBottom()
            } else if (data.type === 'done') {
              typing.value = false
              settleStreamMsg(aiMsg)
            } else if (data.type === 'error') {
              aiMsg.content = data.message || '抱歉，出了点问题~'
              typing.value = false
              settleStreamMsg(aiMsg)
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  } catch (e) {
    aiMsg.content = '抱歉，出了点问题~ 请稍后再试。'
    settleStreamMsg(aiMsg)
  } finally {
    typing.value = false
    sending = false
    scrollToBottom()
  }
}

onMounted(() => {
  loadHistory()
  // 每3秒轮询新消息（微信端发来的）
  pollTimer = setInterval(() => loadHistory(true), 3000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
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

.chat-previews {
  display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 16px 0;
  background: var(--bg-card); border-left: 1px solid var(--border); border-right: 1px solid var(--border);
}
.chat-preview { position: relative; width: 64px; height: 64px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
.chat-preview-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.chat-preview-del {
  position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; line-height: 17px;
  text-align: center; border-radius: 50%; background: rgba(0, 0, 0, 0.6); color: white;
  font-size: 13px; cursor: pointer; font-style: normal; user-select: none;
}
.chat-img-btn {
  width: 44px; height: 44px; border-radius: 50%; background: var(--bg-input);
  border: 1px solid var(--border); color: var(--text-dim); font-size: 16px;
  cursor: pointer; flex-shrink: 0; transition: all 0.2s;
}
.chat-img-btn:hover { color: var(--primary); border-color: var(--primary); }

@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
</style>
