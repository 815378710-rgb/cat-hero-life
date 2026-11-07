<template>
  <div v-if="visible" class="gate-mask" role="dialog" aria-modal="true">
    <div class="gate-card">
      <div class="gate-emoji">🐱</div>
      <h2>人生管理系统</h2>
      <p class="gate-hint">请输入访问口令</p>
      <form @submit.prevent="submit">
        <input
          v-model="token"
          type="password"
          autocomplete="current-password"
          placeholder="访问口令"
          autofocus
          :disabled="loading"
        />
        <button type="submit" :disabled="loading || !token">
          {{ loading ? '验证中…' : '解锁' }}
        </button>
      </form>
      <p v-if="error" class="gate-error">{{ error }}</p>
      <p class="gate-foot">口令保存在服务端 data/access_token.txt，解锁状态保留 30 天</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const visible = ref(false)
const token = ref('')
const error = ref('')
const loading = ref(false)

function onUnauthorized() {
  visible.value = true
}

onMounted(() => window.addEventListener('ch:unauthorized', onUnauthorized))
onUnmounted(() => window.removeEventListener('ch:unauthorized', onUnauthorized))

async function submit() {
  if (!token.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const res = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.value }),
    })
    if (res.ok) {
      visible.value = false
      // 从彩票页等独立页面被弹回来时，解锁后自动返回原页面
      let back = ''
      try {
        back = sessionStorage.getItem('ch_after_unlock') || ''
        sessionStorage.removeItem('ch_after_unlock')
      } catch { /* storage 不可用时忽略 */ }
      location.href = back || location.href
      return
    }
    error.value = res.status === 403 ? '口令错误，请重试' : '验证失败，请稍后重试'
  } catch {
    error.value = '网络异常，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.gate-mask {
  position: fixed; inset: 0; z-index: 100000;
  display: flex; align-items: center; justify-content: center;
  background: #f4f5fa;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.gate-card {
  width: min(360px, calc(100vw - 48px));
  padding: 36px 30px 28px;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 18px 60px rgba(80, 70, 130, .14);
  text-align: center;
  color: #3a3f52;
}
.gate-emoji { font-size: 44px; line-height: 1; margin-bottom: 12px; }
h2 { margin: 0 0 6px; font-size: 20px; font-weight: 700; }
.gate-hint { margin: 0 0 22px; font-size: 13px; color: #8a90a3; }
form { display: flex; flex-direction: column; gap: 10px; }
input {
  height: 42px; padding: 0 14px; font-size: 14px;
  border: 1px solid #dfe3ee; border-radius: 10px;
  outline: none; background: #fafbfe; color: #3a3f52;
  transition: border-color .15s, box-shadow .15s;
}
input:focus { border-color: #a06bff; box-shadow: 0 0 0 3px rgba(160, 107, 255, .13); }
button {
  height: 42px; border: 0; border-radius: 10px; cursor: pointer;
  background: linear-gradient(135deg, #ff6b9d, #a06bff);
  color: #fff; font-size: 14px; font-weight: 600;
  transition: opacity .15s, transform .15s;
}
button:active { transform: scale(.98); }
button:disabled { opacity: .55; cursor: not-allowed; }
.gate-error { margin: 12px 0 0; font-size: 12px; color: #e0455f; }
.gate-foot { margin: 20px 0 0; font-size: 11px; line-height: 1.6; color: #a8adbd; }
</style>
