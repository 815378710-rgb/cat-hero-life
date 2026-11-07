import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import i18n from './i18n'
import App from './App.vue'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './styles/enhance.css'
import './styles/dark.css'

// ---------------------------------------------------------------------------
// API 请求自动重试
// 背景：Cloudflare Tunnel 从淄博联通回源，隧道全部落地洛杉矶（lax01-13），
// 跨境链路对 GET 请求约有 30% 概率超时或中途断流。服务端已加 gzip 缓解，
// 这里再做一层客户端兜底：GET 失败自动重试 2 次，把体感成功率拉到 95% 以上。
// 写请求（POST/PUT/DELETE）一律不重试，避免重复打卡、重复记账等副作用。
// ---------------------------------------------------------------------------
const rawFetch = window.fetch.bind(window)
const RETRY_DELAYS = [400, 1200]

// 任一 /api 请求返回 401 时，通知 App.vue 里的 AccessGate 弹出解锁层
function notifyUnauthorized(res: Response) {
  if (res.status === 401) window.dispatchEvent(new CustomEvent('ch:unauthorized'))
  return res
}

window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const isApi = url.includes('/api/')
  const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()

  if (!isApi) return rawFetch(input as any, init)
  // 写请求不重试，但仍需检查 401
  if (method !== 'GET') return notifyUnauthorized(await rawFetch(input as any, init))

  let lastError: unknown
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), attempt === 0 ? 9000 : 20000)
      const res = await rawFetch(input as any, { ...init, signal: init?.signal ?? ctrl.signal })
      clearTimeout(timer)
      // 401 是鉴权问题，重试无意义，直接交给解锁层
      if (res.status === 401) return notifyUnauthorized(res)
      // 其余 4xx 是业务错误，重试无意义；5xx / 网关错误值得重试
      if (res.ok || (res.status >= 400 && res.status < 500)) return notifyUnauthorized(res)
      lastError = new Error(`HTTP ${res.status}`)
    } catch (e) {
      lastError = e
    }
    if (attempt < RETRY_DELAYS.length) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]))
    }
  }
  throw lastError
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n as any)
app.mount('#app')

// 通知 index.html 里的首屏引导层：应用已挂载，可以撤掉加载态了
;(window as any).__bootReady?.()
