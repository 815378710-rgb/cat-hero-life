<template>
  <div class="room-page">
    <div class="page-header">
      <div>
        <h2>🏠 阿蓝的小房间</h2>
        <p class="sub">房间是表演，右侧文字才是真实的记忆。</p>
      </div>
      <div class="phase-badge">{{ phaseIcon }} {{ phaseLabel }} · {{ clockText }}</div>
    </div>

    <div class="room-layout">
      <!-- ============ 房间 ============ -->
      <section class="room-stage">
        <svg class="room-svg" viewBox="0 0 800 520" role="img" aria-label="阿蓝的房间">
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" :stop-color="sky.top" />
              <stop offset="100%" :stop-color="sky.bottom" />
            </linearGradient>
            <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#2f4b8f" />
              <stop offset="100%" stop-color="#8fc0f5" />
            </linearGradient>
            <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#eef5ff" />
              <stop offset="100%" stop-color="#e3eeff" />
            </linearGradient>
          </defs>

          <!-- 墙与地板 -->
          <rect x="0" y="0" width="800" height="400" fill="url(#wall)" />
          <rect x="0" y="400" width="800" height="120" fill="#f6e7d2" />
          <path d="M0 400 H800" stroke="#e2cfb4" stroke-width="3" />
          <ellipse cx="380" cy="452" rx="220" ry="34" fill="#e9d9f5" opacity=".75" />

          <!-- 窗 -->
          <g>
            <rect x="300" y="52" width="210" height="180" rx="10" fill="#fff" stroke="#cddcf3" stroke-width="7" />
            <rect x="310" y="62" width="190" height="160" rx="5" fill="url(#sky)" />
            <circle v-if="phase === 'day'" cx="445" cy="100" r="22" fill="#ffe9a8" opacity=".9" />
            <circle v-else-if="phase === 'dawn'" cx="415" cy="140" r="26" fill="#ffd8a0" opacity=".85" />
            <circle v-else-if="phase === 'dusk'" cx="470" cy="150" r="24" fill="#ff9f7a" opacity=".8" />
            <g v-else>
              <circle cx="450" cy="100" r="17" fill="#fdf6d8" />
              <circle cx="456" cy="96" r="15" fill="#dfe8ff" />
              <circle v-for="s in stars" :key="s.k" :cx="s.x" :cy="s.y" r="1.6" fill="#fff" :opacity="s.o" />
            </g>
            <path d="M310 190 Q360 165 410 188 T500 182 V222 H310 Z" fill="#bcd6c0" opacity=".55" />
            <path d="M405 62 V222 M310 142 H500" stroke="#fff" stroke-width="6" opacity=".9" />
          </g>

          <!-- 窗帘 -->
          <path d="M292 48 Q320 130 296 240 L318 240 Q336 130 318 48 Z" fill="#ffd9e6" opacity=".85" />
          <path d="M510 48 Q482 130 506 240 L484 240 Q466 130 484 48 Z" fill="#ffd9e6" opacity=".85" />

          <!-- 书架 -->
          <g>
            <rect x="570" y="150" width="150" height="215" rx="6" fill="#e8c9a0" stroke="#d3ab7e" stroke-width="4" />
            <rect x="578" y="222" width="134" height="6" fill="#d3ab7e" />
            <rect x="578" y="292" width="134" height="6" fill="#d3ab7e" />
            <rect v-for="(b, i) in books" :key="i" :x="b.x" :y="b.y" :width="b.w" :height="b.h"
                  :fill="b.c" rx="2" />
          </g>

          <!-- 书桌 -->
          <g>
            <rect x="90" y="300" width="170" height="12" rx="4" fill="#d9ae7e" />
            <rect x="102" y="312" width="10" height="82" fill="#c99a68" />
            <rect x="238" y="312" width="10" height="82" fill="#c99a68" />
            <rect x="128" y="282" width="52" height="18" rx="2" fill="#fffdf7" stroke="#e7ddc8" stroke-width="2" />
            <path d="M196 300 v-32 h16" stroke="#7a8ba8" stroke-width="4" fill="none" />
            <circle cx="212" cy="268" r="9" :fill="phase === 'night' ? '#ffe6a0' : '#e9eef8'" />
          </g>

          <!-- 休息角 -->
          <g>
            <rect x="620" y="380" width="140" height="42" rx="16" fill="#cfe0fb" />
            <rect x="636" y="366" width="52" height="22" rx="10" fill="#fff" opacity=".9" />
          </g>

          <!-- ===== 角色（原创简化形象，非上游立绘） ===== -->
          <g class="char" :transform="`translate(${charPos.x}, ${charPos.y})`" :class="{ resting: state === 'rest' }">
            <!-- 鲸鱼尾巴 -->
            <path class="tail" d="M-34 -18 Q-72 -46 -80 -22 Q-70 -8 -58 -10 Q-72 6 -60 16 Q-44 12 -32 2 Z"
                  fill="#5b8def" stroke="#3c68bd" stroke-width="2" />
            <!-- 身体 / 围裙 -->
            <path d="M-24 -22 Q0 -34 24 -22 L28 30 Q0 40 -28 30 Z" fill="#ffffff" stroke="#cfdcf2" stroke-width="2" />
            <path d="M-24 -20 Q0 -30 24 -20 L25 4 Q0 10 -25 4 Z" fill="#4d7bd8" />
            <ellipse cx="0" cy="-6" rx="6" ry="8" fill="#ffd36b" />
            <!-- 头发后层 -->
            <path d="M-32 -72 Q-38 -34 -30 -12 Q0 -2 30 -12 Q38 -34 32 -72 Z" fill="url(#hair)" />
            <!-- 脸 -->
            <circle cx="0" cy="-64" r="30" fill="#fff4e9" stroke="#e8d5c4" stroke-width="2" />
            <!-- 刘海 + 呆毛 -->
            <path d="M-31 -72 Q-20 -100 0 -98 Q22 -100 31 -72 Q18 -82 6 -78 Q-4 -88 -18 -78 Z" fill="url(#hair)" />
            <path class="ahoge" d="M2 -98 Q10 -118 22 -114" stroke="#2f4b8f" stroke-width="3" fill="none" stroke-linecap="round" />
            <!-- 眼睛 -->
            <g class="eyes">
              <ellipse v-if="state !== 'rest'" cx="-11" cy="-62" rx="4.5" ry="6" fill="#2f4b8f" />
              <ellipse v-if="state !== 'rest'" cx="11" cy="-62" rx="4.5" ry="6" fill="#2f4b8f" />
              <path v-else d="M-16 -62 q5 5 10 0 M6 -62 q5 5 10 0" stroke="#2f4b8f" stroke-width="2" fill="none" />
              <circle v-if="state !== 'rest'" cx="-12.5" cy="-64" r="1.6" fill="#fff" />
              <circle v-if="state !== 'rest'" cx="9.5" cy="-64" r="1.6" fill="#fff" />
            </g>
            <circle cx="-20" cy="-52" r="4" fill="#ffb7c5" opacity=".6" />
            <circle cx="20" cy="-52" r="4" fill="#ffb7c5" opacity=".6" />
            <!-- 手 / 动作 -->
            <g v-if="state === 'desk'" class="pen-hand">
              <path d="M18 -8 q14 -6 22 -20" stroke="#fff4e9" stroke-width="8" fill="none" stroke-linecap="round" />
              <path d="M40 -28 l6 -12" stroke="#5b6b8a" stroke-width="3" stroke-linecap="round" />
            </g>
            <g v-else-if="state === 'bookshelf'">
              <rect x="14" y="-18" width="24" height="18" rx="2" fill="#fff" stroke="#9db4dd" stroke-width="2" />
              <path d="M26 -18 V0" stroke="#9db4dd" stroke-width="1.5" />
            </g>
            <g v-else-if="state === 'rest'" class="zzz">
              <text x="26" y="-88" font-size="14" fill="#7a9ad6">z</text>
              <text x="36" y="-102" font-size="18" fill="#7a9ad6">Z</text>
            </g>
          </g>
        </svg>

        <div class="stage-bar">
          <button v-for="s in stateList" :key="s.id" class="state-btn" :class="{ active: state === s.id }"
                  @click="state = s.id">
            {{ s.icon }} {{ s.label }}
          </button>
        </div>
      </section>

      <!-- ============ 记忆星海 ============ -->
      <aside class="memory-panel">
        <div class="mem-head">
          <h3>✨ 记忆星海</h3>
          <button class="mini-btn" :disabled="loading" @click="loadMemories">
            {{ loading ? '同步中' : '刷新' }}
          </button>
        </div>
        <p class="mem-src">{{ sourceNote }}</p>

        <svg class="star-svg" viewBox="0 0 340 400" role="img" aria-label="记忆关系图">
          <line v-for="(l, i) in links" :key="'l' + i" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2"
                stroke="#c7d8f5" stroke-width="1" opacity=".7" />
          <g v-for="n in nodes" :key="n.id" class="star-node" @click="selected = n">
            <circle :cx="n.x" :cy="n.y" :r="n.r + 6" :fill="n.color" opacity=".12" />
            <circle :cx="n.x" :cy="n.y" :r="n.r" :fill="n.color"
                    :stroke="selected?.id === n.id ? '#2f4b8f' : '#fff'" stroke-width="2" />
          </g>
          <text v-if="nodes.length === 0" x="170" y="190" text-anchor="middle" fill="#9aa6bd" font-size="13">
            还没有记忆，聊几句就有了
          </text>
        </svg>

        <div v-if="selected" class="mem-detail">
          <div class="mem-title">{{ selected.title || '(无标题)' }}</div>
          <div class="mem-meta">{{ selected.memory_type || '未分类' }} · 重要度 {{ selected.importance ?? '-' }} · {{ shortDate(selected.created_at) }}</div>
          <p>{{ selected.summary || selected.content || '（无正文）' }}</p>
          <div class="mem-meta">来源：{{ selected.source || '未知' }}</div>
        </div>
        <div v-else class="mem-hint">点一个光点看看她记住了什么</div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

type Mem = {
  id: string; title?: string; content?: string; summary?: string
  memory_type?: string; importance?: number; source?: string
  created_at?: string; related_memory_id?: string
}

const stateList = [
  { id: 'idle', icon: '💤', label: '发呆' },
  { id: 'desk', icon: '✍️', label: '写字' },
  { id: 'bookshelf', icon: '📖', label: '看书' },
  { id: 'window', icon: '🪟', label: '望窗' },
  { id: 'rest', icon: '🌙', label: '睡觉' },
] as const
type StateId = typeof stateList[number]['id']

const state = ref<StateId>('idle')
const charPos = computed(() => ({
  idle: { x: 380, y: 424 }, desk: { x: 176, y: 390 },
  bookshelf: { x: 552, y: 400 }, window: { x: 405, y: 380 },
  rest: { x: 672, y: 370 },
}[state.value]))

// 昼夜（Asia/Shanghai）
const now = ref(new Date())
let timer: number | undefined
const hour = computed(() => Number(new Intl.DateTimeFormat('en-GB', {
  hour: 'numeric', hour12: false, timeZone: 'Asia/Shanghai',
}).format(now.value)))
const phase = computed(() => {
  const h = hour.value
  return h < 6 ? 'night' : h < 9 ? 'dawn' : h < 17 ? 'day' : h < 20 ? 'dusk' : 'night'
})
const phaseLabel = computed(() => ({ dawn: '晨光', day: '白天', dusk: '晚霞', night: '夜间' })[phase.value])
const phaseIcon = computed(() => ({ dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌌' })[phase.value])
const clockText = computed(() => new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai',
}).format(now.value))
const sky = computed(() => ({
  dawn: { top: '#ffd9b8', bottom: '#cfe4ff' },
  day: { top: '#9ec9f5', bottom: '#e3f2ff' },
  dusk: { top: '#ff9f8a', bottom: '#8f8ad0' },
  night: { top: '#243a70', bottom: '#5b6ea8' },
}[phase.value]))

const stars = Array.from({ length: 14 }, (_, i) => ({
  k: i, x: 320 + ((i * 47) % 175), y: 70 + ((i * 31) % 100), o: 0.4 + (i % 4) * 0.15,
}))
const books = Array.from({ length: 12 }, (_, i) => ({
  x: 584 + (i % 6) * 22, y: i < 6 ? 176 : 246, w: 14 + (i % 3) * 3,
  h: i < 6 ? 44 : 44 - (i % 3) * 5, c: ['#7aa7f7', '#ffb7c5', '#f2c46b', '#8ed0b4'][i % 4],
}))

// ---- 真实记忆（不造演示数据：接口失败就明确显示不可用）----
const memories = ref<Mem[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const selected = ref<any>(null)

const sourceNote = computed(() => {
  if (loadFailed.value) return '记忆源暂不可用，未使用任何虚构演示数据'
  return `真实记忆 ${memories.value.length} 条 · 来自 ai_memory（只读）`
})

async function loadMemories() {
  loading.value = true
  loadFailed.value = false
  try {
    const res = await fetch('/api/memory?limit=60')
    if (!res.ok) throw new Error(String(res.status))
    const j = await res.json()
    memories.value = Array.isArray(j.memories) ? j.memories : []
  } catch {
    loadFailed.value = true
    memories.value = []
  } finally {
    loading.value = false
  }
}

const TYPE_COLORS: Record<string, string> = {
  conversation: '#7aa7f7', event: '#ffb7c5', personality: '#f2c46b',
  preference: '#8ed0b4', fact: '#a99cf0',
}
function hash01(seed: string, salt: string) {
  let h = 2166136261
  for (const c of seed + salt) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  // Murmur finalizer：UUID 前缀相似会让普通 FNV 的 x/y 结果线性相关，
  // 节点会排成几条斜线；这里把位彻底打散，星图才是散开的。
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return ((h >>> 0) % 10000) / 10000
}
const nodes = computed(() => memories.value.slice(0, 48).map(m => {
  const id = String(m.id || '')
  return {
    ...m,
    x: 28 + hash01(id, 'x') * 284,
    y: 28 + hash01(id, 'y') * 344,
    r: 4 + Math.min(8, Number(m.importance || 5) * 0.7),
    color: TYPE_COLORS[m.memory_type || ''] || '#9fb6dd',
  }
}))
const links = computed(() => {
  const map = new Map(nodes.value.map(n => [String(n.id), n]))
  const out: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (const n of nodes.value) {
    const p = n.related_memory_id && map.get(String(n.related_memory_id))
    if (p) out.push({ x1: n.x, y1: n.y, x2: p.x, y2: p.y })
  }
  return out
})
const shortDate = (s?: string) => (s ? String(s).slice(0, 10) : '日期未知')

onMounted(() => {
  loadMemories()
  timer = window.setInterval(() => { now.value = new Date() }, 60_000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.room-page { padding: 20px; max-width: 1320px; margin: 0 auto; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
h2 { margin: 0 0 4px; font-size: 20px; color: #3a4a6b; }
.sub { margin: 0; font-size: 12px; color: #8a97b0; }
.phase-badge { padding: 7px 14px; border-radius: 999px; background: #eaf2ff; color: #55709e; font-size: 12px; white-space: nowrap; }

.room-layout { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 16px; align-items: start; }
.room-stage, .memory-panel { background: #fff; border-radius: 18px; box-shadow: 0 8px 30px rgba(80, 110, 170, .09); overflow: hidden; }
.room-svg { display: block; width: 100%; height: auto; background: #eef5ff; }
.stage-bar { display: flex; gap: 8px; padding: 12px 14px; flex-wrap: wrap; border-top: 1px solid #eef2fa; }
.state-btn { border: 1px solid #dfe8f7; background: #f8fbff; color: #5a6c8c; border-radius: 999px;
  padding: 7px 13px; font-size: 12px; cursor: pointer; transition: all .15s; }
.state-btn:hover { border-color: #9db9ee; }
.state-btn.active { background: linear-gradient(135deg, #7aa7f7, #a99cf0); color: #fff; border-color: transparent; }

.char { transition: transform .8s cubic-bezier(.22, .8, .3, 1); }
.char.resting { transform-origin: center; }
.tail { transform-origin: -30px -10px; animation: sway 3.2s ease-in-out infinite; }
.ahoge { animation: sway 2.6s ease-in-out infinite; }
.eyes { transform-box: fill-box; transform-origin: center; animation: blink 4.6s infinite; }
.pen-hand { animation: write 1.1s ease-in-out infinite; }
.zzz text { animation: float 2.4s ease-in-out infinite; }
.zzz text:last-child { animation-delay: .5s; }
@keyframes sway { 0%,100% { transform: rotate(-3deg) } 50% { transform: rotate(4deg) } }
@keyframes write { 0%,100% { transform: translateY(0) } 50% { transform: translateY(3px) rotate(3deg) } }
@keyframes blink { 0%,92%,100% { transform: scaleY(1) } 95% { transform: scaleY(.1) } }
@keyframes float { 0%,100% { opacity: .35; transform: translateY(0) } 50% { opacity: 1; transform: translateY(-5px) } }

.memory-panel { padding: 16px; }
.mem-head { display: flex; align-items: center; justify-content: space-between; }
.mem-head h3 { margin: 0; font-size: 15px; color: #3a4a6b; }
.mini-btn { border: 1px solid #dfe8f7; background: #f8fbff; color: #5a6c8c; border-radius: 8px;
  padding: 5px 10px; font-size: 11px; cursor: pointer; }
.mem-src { margin: 6px 0 8px; font-size: 11px; color: #9aa6bd; }
.star-svg { display: block; width: 100%; height: auto; min-height: 260px; border-radius: 12px;
  background: radial-gradient(circle at 50% 40%, #f6faff, #eaf1ff); }
.star-node { cursor: pointer; }
.star-node:hover circle:last-child { stroke: #2f4b8f; }
.mem-detail { margin-top: 10px; padding: 12px; border-radius: 12px; background: #f7faff; border: 1px solid #e6eefc; }
.mem-title { font-size: 13px; font-weight: 600; color: #3a4a6b; }
.mem-meta { font-size: 11px; color: #9aa6bd; margin-top: 3px; }
.mem-detail p { font-size: 12px; line-height: 1.6; color: #5a6c8c; margin: 8px 0; }
.mem-hint { margin-top: 10px; text-align: center; font-size: 11px; color: #aab5cb; }

@media (max-width: 980px) {
  .room-layout { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .char, .tail, .ahoge, .eyes, .pen-hand, .zzz text { animation: none !important; transition: none !important; }
}
</style>
