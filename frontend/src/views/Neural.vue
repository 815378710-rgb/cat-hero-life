<template>
  <div class="neural-page">
    <h1 class="page-title">🧠 神经智能系统</h1>
    <p class="page-subtitle">你的生命是一个网络，每个维度都在互相影响</p>

    <!-- 能量仪表盘 -->
    <div class="card energy-card">
      <h2>⚡ 当前能量</h2>
      <div class="energy-gauge">
        <div class="gauge-circle" :style="{ borderColor: energyData.level?.color || '#4ECDC4' }">
          <span class="gauge-value">{{ energyData.energy }}</span>
          <span class="gauge-label">{{ energyData.level?.label || '加载中' }}</span>
        </div>
      </div>
      <p class="energy-suggestion">{{ energyData.level?.suggestion }}</p>
      <div class="energy-breakdown" v-if="energyData.breakdown">
        <div class="breakdown-item" v-for="(item, key) in energyData.breakdown" :key="key">
          <span class="breakdown-label">{{ item.label }}</span>
          <div class="breakdown-bar">
            <div class="breakdown-fill" :style="{ width: Math.min(100, Math.abs(item.impact) * 3) + '%', background: item.impact >= 0 ? '#4CAF50' : '#F44336' }"></div>
          </div>
          <span class="breakdown-value" :class="item.impact >= 0 ? 'positive' : 'negative'">{{ item.impact >= 0 ? '+' : '' }}{{ item.impact }}</span>
        </div>
      </div>
    </div>

    <!-- 属性关系图 -->
    <div class="card neural-card">
      <h2>🔗 属性关系网络</h2>
      <p class="card-desc">维度之间的连线表示影响关系，线越粗影响越大</p>
      <div class="network-graph" ref="networkGraph">
        <svg :width="graphWidth" :height="graphHeight">
          <!-- 连线 -->
          <line v-for="edge in graphEdges" :key="edge.id"
            :x1="edge.x1" :y1="edge.y1" :x2="edge.x2" :y2="edge.y2"
            :stroke="edge.color" :stroke-width="edge.weight * 3 + 0.5"
            :opacity="0.6" />
          <!-- 节点 -->
          <g v-for="node in graphNodes" :key="node.id" :transform="`translate(${node.x}, ${node.y})`">
            <circle :r="node.radius" :fill="node.color" :stroke="'#fff'" stroke-width="2" />
            <text text-anchor="middle" dy="0.3em" fill="#fff" font-size="11" font-weight="bold">{{ node.value }}</text>
            <text text-anchor="middle" :dy="node.radius + 16" :fill="'var(--text)'" font-size="12">{{ node.name }}</text>
          </g>
        </svg>
      </div>
    </div>

    <!-- 人生平衡雷达 -->
    <div class="card radar-card">
      <h2>🎯 人生平衡雷达</h2>
      <div class="radar-container">
        <svg :width="radarSize" :height="radarSize" class="radar-svg">
          <!-- 背景圆环 -->
          <circle v-for="i in 5" :key="i"
            :cx="radarCenter" :cy="radarCenter" :r="i * radarRadius / 5"
            fill="none" stroke="var(--border)" stroke-width="1" />
          <!-- 轴线 -->
          <line v-for="(dim, i) in dimensions" :key="'axis-'+i"
            :x1="radarCenter" :y1="radarCenter"
            :x2="getRadarPoint(i, 100).x" :y2="getRadarPoint(i, 100).y"
            stroke="var(--border)" stroke-width="1" />
          <!-- 数据多边形 -->
          <polygon :points="radarPolygon" fill="rgba(255, 107, 157, 0.2)" stroke="#FF6B9D" stroke-width="2" />
          <!-- 数据点 -->
          <circle v-for="(point, i) in radarPoints" :key="'point-'+i"
            :cx="point.x" :cy="point.y" r="4" fill="#FF6B9D" />
          <!-- 标签 -->
          <text v-for="(dim, i) in dimensions" :key="'label-'+i"
            :x="getRadarPoint(i, 120).x" :y="getRadarPoint(i, 120).y"
            text-anchor="middle" :fill="'var(--text)'" font-size="12">
            {{ dim.icon }} {{ dim.name }}
          </text>
        </svg>
      </div>
      <div class="balance-info" v-if="balanceData">
        <div class="balance-score">
          <span class="score-value">{{ balanceData.balanceScore }}</span>
          <span class="score-label">平衡度</span>
        </div>
        <div class="balance-shape">
          <span class="shape-type">{{ shapeLabels[balanceData.shapeType] || balanceData.shapeType }}</span>
        </div>
        <p class="balance-narrative">{{ balanceData.narrative }}</p>
      </div>
    </div>

    <!-- 反馈循环 -->
    <div class="card cycles-card" v-if="cycles.length > 0">
      <h2>🔄 反馈循环检测</h2>
      <div class="cycle-item" v-for="cycle in cycles" :key="cycle.path.join('')" :class="cycle.type">
        <span class="cycle-icon">{{ cycle.type === 'positive' ? '✅' : '⚠️' }}</span>
        <span class="cycle-desc">{{ cycle.description }}</span>
        <span class="cycle-count">出现{{ cycle.count }}次</span>
      </div>
    </div>

    <!-- 猫猫侠进化 -->
    <div class="card evolution-card">
      <h2>🐱 猫猫侠进化</h2>
      <div class="evolution-current" v-if="catForm">
        <span class="evolution-emoji">{{ catForm.form_emoji }}</span>
        <div class="evolution-info">
          <h3>{{ catForm.form_name }}</h3>
          <p>{{ catForm.description }}</p>
        </div>
      </div>
      <div class="evolution-next" v-if="nextForm">
        <span class="evolution-arrow">→</span>
        <span class="evolution-emoji-small">{{ nextForm.form_emoji }}</span>
        <span class="evolution-name">{{ nextForm.form_name }}</span>
        <span class="evolution-req">需要 Lv.{{ nextForm.level_required }}</span>
      </div>
    </div>

    <!-- 称号系统 -->
    <div class="card titles-card">
      <h2>🏆 称号</h2>
      <div class="titles-grid">
        <div class="title-item" v-for="title in titles" :key="title.id" :class="{ active: title.is_active }">
          <span class="title-icon">{{ title.icon }}</span>
          <span class="title-name">{{ title.name }}</span>
          <span class="title-desc">{{ title.description }}</span>
          <button v-if="!title.is_active" class="btn-small" @click="equipTitle(title.title_id)">佩戴</button>
          <span v-else class="equipped-badge">佩戴中</span>
        </div>
      </div>
      <p v-if="titles.length === 0" class="empty-hint">还没有解锁称号，继续加油！</p>
    </div>

    <!-- 社交图谱 -->
    <div class="card social-card">
      <h2>👥 社交影响力图谱</h2>
      <div v-if="socialGraph.length > 0" class="social-list">
        <div class="social-person" v-for="p in socialGraph" :key="p.id">
          <span class="person-icon" :style="{ color: p.influence > 0 ? '#4CAF50' : p.influence < 0 ? '#F44336' : '#888' }">●</span>
          <span class="person-name">{{ p.name }}</span>
          <span class="person-rel">{{ p.relationship }}</span>
          <span class="person-influence" :class="p.influence > 0 ? 'positive' : p.influence < 0 ? 'negative' : ''">{{ p.influence > 0 ? '+' : '' }}{{ p.influence }}</span>
        </div>
      </div>
      <div v-if="socialInsights.length > 0" class="social-insights">
        <div class="insight" v-for="(insight, i) in socialInsights" :key="i">
          <span>{{ insight.message }}</span>
        </div>
      </div>
      <p v-if="socialGraph.length === 0" class="empty-hint">还没有社交数据，和猫猫侠聊聊你的朋友吧~</p>
    </div>

    <!-- 人格进化 -->
    <div class="card personality-card" v-if="Object.keys(personalityEvolution).length > 0">
      <h2>🎭 人格进化树</h2>
      <div class="personality-context" v-for="(styles, context) in personalityEvolution" :key="context">
        <div class="context-label">{{ context }}</div>
        <div class="context-styles">
          <span class="style-tag" v-for="s in styles" :key="s.style" :class="{ best: s === styles[0] }">
            {{ s.style }} ({{ s.effectiveness }}%)
          </span>
        </div>
      </div>
    </div>

    <!-- 决策回顾 -->
    <div class="card decisions-card">
      <h2>📋 决策回顾</h2>
      <div class="decision-item" v-for="d in decisions" :key="d.id">
        <div class="decision-header">
          <span class="decision-text">{{ d.decision_text }}</span>
          <span class="decision-time">{{ formatDate(d.decided_at) }}</span>
        </div>
        <div class="decision-outcomes" v-if="d.outcomes && d.outcomes.length > 0">
          <div class="outcome" v-for="o in d.outcomes" :key="o.id" :class="o.verdict">
            <span class="outcome-icon">{{ o.verdict === 'positive' ? '✅' : o.verdict === 'negative' ? '❌' : '⏳' }}</span>
            <span class="outcome-text">{{ o.narrative }}</span>
          </div>
        </div>
        <div v-else class="decision-pending">等待回顾...</div>
      </div>
      <p v-if="decisions.length === 0" class="empty-hint">还没有重要决策记录</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import axios from 'axios'

const API = '/api/neural'

// 能量数据
const energyData = ref<any>({ energy: 50, level: null, breakdown: null })

// 关系图数据
const matrix = ref<any>({})
const userDims = ref<any>({})
const graphWidth = 500
const graphHeight = 400

// 雷达图数据
const balanceData = ref<any>(null)
const radarSize = 320
const radarCenter = 160
const radarRadius = 120

// 循环检测
const cycles = ref<any[]>([])

// 猫猫侠进化
const catForm = ref<any>(null)
const nextForm = ref<any>(null)

// 称号
const titles = ref<any[]>([])

// 社交图谱
const socialGraph = ref<any[]>([])
const socialInsights = ref<any[]>([])

// 人格进化
const personalityEvolution = ref<any>({})

// 决策
const decisions = ref<any[]>([])

const dimensions = [
  { id: 'health', name: '健康', icon: '💪', color: '#FF6B6B' },
  { id: 'finance', name: '财务', icon: '💰', color: '#4ECDC4' },
  { id: 'learning', name: '学习', icon: '📚', color: '#45B7D1' },
  { id: 'career', name: '职业', icon: '💼', color: '#96CEB4' },
  { id: 'social', name: '社交', icon: '❤️', color: '#FFEAA7' },
  { id: 'mental', name: '心理', icon: '🧘', color: '#DDA0DD' },
  { id: 'habits', name: '习惯', icon: '🎯', color: '#F0E68C' },
  { id: 'creativity', name: '创造', icon: '🎨', color: '#FFB347' }
]

const shapeLabels: Record<string, string> = {
  balanced_high: '🌟 均衡高手', plateau_low: '📊 低水平原', plateau: '🏔️ 高原',
  needle: '📌 针型', spike: '📈 尖刺型', dip: '📉 凹陷型',
  introvert: '🧘 内倾型', extrovert: '🤝 外倾型', irregular: '🔀 不规则型'
}

// 图形节点
const graphNodes = computed(() => {
  const nodes = []
  const cx = graphWidth / 2, cy = graphHeight / 2
  const r = Math.min(graphWidth, graphHeight) * 0.35
  for (let i = 0; i < dimensions.length; i++) {
    const angle = (i / dimensions.length) * Math.PI * 2 - Math.PI / 2
    const dim = dimensions[i]
    const value = userDims.value[dim.id] || 0
    nodes.push({
      id: dim.id, name: dim.name, color: dim.color, value,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      radius: 15 + value / 10
    })
  }
  return nodes
})

// 图形连线
const graphEdges = computed(() => {
  const edges = []
  const nodeMap: Record<string, any> = {}
  for (const n of graphNodes.value) nodeMap[n.id] = n

  for (const [source, targets] of Object.entries(matrix.value)) {
    for (const [target, weight] of Object.entries(targets as any)) {
      if ((weight as number) > 0.15 && nodeMap[source] && nodeMap[target]) {
        edges.push({
          id: `${source}-${target}`,
          x1: nodeMap[source].x, y1: nodeMap[source].y,
          x2: nodeMap[target].x, y2: nodeMap[target].y,
          weight: weight as number,
          color: nodeMap[source].color
        })
      }
    }
  }
  return edges
})

// 雷达图计算
function getRadarPoint(index: number, value: number) {
  const angle = (index / dimensions.length) * Math.PI * 2 - Math.PI / 2
  const r = (value / 100) * radarRadius
  return {
    x: radarCenter + Math.cos(angle) * r,
    y: radarCenter + Math.sin(angle) * r
  }
}

const radarPoints = computed(() => {
  return dimensions.map((dim, i) => {
    const value = userDims.value[dim.id] || 0
    return getRadarPoint(i, value)
  })
})

const radarPolygon = computed(() => {
  return radarPoints.value.map(p => `${p.x},${p.y}`).join(' ')
})

// 加载数据
async function loadAll() {
  try {
    const [energyRes, matrixRes, balanceRes, cyclesRes, formRes, titlesRes, decisionsRes, socialRes, insightsRes, personalityRes] = await Promise.all([
      axios.get(`${API}/energy/current`),
      axios.get(`${API}/neural/matrix`),
      axios.get(`${API}/balance/snapshot`),
      axios.get(`${API}/neural/cycles`),
      axios.get(`${API}/gamification/cat-form`),
      axios.get(`${API}/gamification/titles`),
      axios.get(`${API}/decisions/history`),
      axios.get(`${API}/social/graph`),
      axios.get(`${API}/social/insights`),
      axios.get(`${API}/personality/evolution`)
    ])

    energyData.value = energyRes.data
    matrix.value = matrixRes.data.matrix || {}
    balanceData.value = balanceRes.data
    cycles.value = cyclesRes.data.cycles || []
    catForm.value = formRes.data.current
    nextForm.value = formRes.data.next
    titles.value = titlesRes.data.titles || []
    decisions.value = (decisionsRes.data.decisions || []).slice(0, 5)
    socialGraph.value = socialRes.data.graph || []
    socialInsights.value = insightsRes.data.insights || []
    personalityEvolution.value = personalityRes.data.evolution || {}

    // 获取用户维度值
    const dashRes = await axios.get('/api/dashboard')
    const u = dashRes.data.user
    userDims.value = {
      health: u.stat_health, finance: u.stat_finance,
      learning: u.stat_learning, career: u.stat_career,
      social: u.stat_social, mental: u.stat_mental,
      habits: u.stat_habits, creativity: u.stat_creativity
    }
  } catch (e) {
    console.error('加载失败:', e)
  }
}

async function equipTitle(titleId: string) {
  try {
    await axios.post(`${API}/gamification/equip-title`, { titleId })
    const res = await axios.get(`${API}/gamification/titles`)
    titles.value = res.data.titles || []
  } catch {}
}

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

onMounted(loadAll)
</script>

<style scoped>
.neural-page { max-width: 900px; margin: 0 auto; }
.page-title { font-size: 24px; color: var(--primary); margin-bottom: 4px; }
.page-subtitle { color: var(--text-dim); margin-bottom: 24px; font-size: 14px; }
.card { background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border); padding: 20px; margin-bottom: 16px; }
.card h2 { font-size: 16px; margin-bottom: 12px; }
.card-desc { font-size: 13px; color: var(--text-dim); margin-bottom: 12px; }

/* 能量仪表盘 */
.energy-card { text-align: center; }
.energy-gauge { margin: 16px 0; }
.gauge-circle { width: 120px; height: 120px; border-radius: 50%; border: 4px solid; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; }
.gauge-value { font-size: 36px; font-weight: 700; }
.gauge-label { font-size: 12px; color: var(--text-dim); }
.energy-suggestion { color: var(--text-dim); font-size: 13px; margin-bottom: 16px; }
.energy-breakdown { text-align: left; }
.breakdown-item { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 13px; }
.breakdown-label { width: 60px; color: var(--text-dim); }
.breakdown-bar { flex: 1; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.breakdown-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
.breakdown-value { width: 40px; text-align: right; font-weight: 600; }
.breakdown-value.positive { color: #4CAF50; }
.breakdown-value.negative { color: #F44336; }

/* 关系图 */
.network-card { overflow-x: auto; }
.network-graph { display: flex; justify-content: center; }

/* 雷达图 */
.radar-card { text-align: center; }
.radar-container { display: flex; justify-content: center; margin-bottom: 16px; }
.balance-info { text-align: center; }
.balance-score { margin-bottom: 8px; }
.score-value { font-size: 36px; font-weight: 700; color: var(--primary); }
.score-label { display: block; font-size: 12px; color: var(--text-dim); }
.shape-type { display: inline-block; padding: 4px 12px; background: rgba(255,107,157,0.15); border-radius: 20px; font-size: 13px; margin-bottom: 8px; }
.balance-narrative { color: var(--text-dim); font-size: 13px; line-height: 1.6; }

/* 循环检测 */
.cycle-item { display: flex; align-items: center; gap: 8px; padding: 10px; border-radius: 8px; margin-bottom: 8px; font-size: 13px; }
.cycle-item.positive { background: rgba(76,175,80,0.1); }
.cycle-item.negative { background: rgba(244,67,54,0.1); }
.cycle-count { color: var(--text-dim); font-size: 12px; margin-left: auto; }

/* 进化 */
.evolution-current { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
.evolution-emoji { font-size: 48px; }
.evolution-info h3 { margin-bottom: 4px; }
.evolution-info p { color: var(--text-dim); font-size: 13px; }
.evolution-next { display: flex; align-items: center; gap: 8px; color: var(--text-dim); font-size: 13px; }
.evolution-arrow { font-size: 18px; }
.evolution-emoji-small { font-size: 24px; }
.evolution-req { margin-left: auto; }

/* 称号 */
.titles-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.title-item { padding: 10px; border-radius: 8px; border: 1px solid var(--border); font-size: 13px; }
.title-item.active { border-color: var(--primary); background: rgba(255,107,157,0.1); }
.title-icon { font-size: 20px; margin-right: 6px; }
.title-name { font-weight: 600; }
.title-desc { display: block; color: var(--text-dim); font-size: 12px; margin-top: 4px; }
.equipped-badge { display: inline-block; padding: 2px 8px; background: var(--primary); color: #fff; border-radius: 10px; font-size: 11px; margin-top: 4px; }
.btn-small { padding: 4px 10px; border: 1px solid var(--primary); background: none; color: var(--primary); border-radius: 6px; cursor: pointer; font-size: 11px; margin-top: 4px; }
.btn-small:hover { background: var(--primary); color: #fff; }

/* 决策 */
.decision-item { padding: 12px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 8px; }
.decision-header { display: flex; justify-content: space-between; margin-bottom: 6px; }
.decision-text { font-weight: 600; font-size: 14px; }
.decision-time { color: var(--text-dim); font-size: 12px; }
.outcome { display: flex; gap: 6px; font-size: 13px; margin-top: 4px; }
.outcome.positive { color: #4CAF50; }
.outcome.negative { color: #F44336; }
.decision-pending { color: var(--text-dim); font-size: 12px; }
.empty-hint { color: var(--text-dim); font-size: 13px; text-align: center; padding: 20px; }

/* 社交图谱 */
.social-list { margin-bottom: 12px; }
.social-person { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.person-icon { font-size: 10px; }
.person-name { font-weight: 600; }
.person-rel { color: var(--text-dim); font-size: 11px; }
.person-influence { margin-left: auto; font-weight: 600; font-size: 12px; }
.person-influence.positive { color: #4CAF50; }
.person-influence.negative { color: #F44336; }
.social-insights { margin-top: 8px; }
.insight { padding: 8px; background: rgba(255,107,157,0.05); border-radius: 6px; font-size: 12px; margin-bottom: 4px; }

/* 人格进化 */
.personality-context { margin-bottom: 10px; }
.context-label { font-size: 12px; color: var(--text-dim); margin-bottom: 4px; }
.context-styles { display: flex; gap: 6px; flex-wrap: wrap; }
.style-tag { padding: 3px 8px; background: var(--bg-input); border-radius: 10px; font-size: 11px; }
.style-tag.best { background: var(--primary); color: #fff; }
</style>
