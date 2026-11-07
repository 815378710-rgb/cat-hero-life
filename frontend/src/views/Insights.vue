<template>
  <div class="insights-page">
    <div class="page-header">
      <h2>🧠 AI 洞见分析</h2>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm btn-primary" @click="generateInsights" :disabled="loading">🔄 重新生成</button>
        <button class="btn btn-sm btn-primary" @click="loadInsights" :disabled="loading">🔄 刷新</button>
      </div>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="skeleton-section" v-for="i in 3" :key="i"></div>
    </div>

    <template v-else>
      <!-- Strengths -->
      <div v-if="data.strengths?.length" class="section">
        <div class="section-header strength">
          <span class="section-icon">💪</span>
          <span class="section-title">优势维度</span>
        </div>
        <div class="card-grid">
          <div v-for="item in data.strengths" :key="item.dimension" class="insight-card strength-card">
            <div class="card-dim">{{ item.dimension }}</div>
            <div class="card-score" :style="{ color: '#4CAF50' }">{{ item.score }}</div>
            <div class="card-bar"><div class="card-bar-fill green" :style="{ width: item.score + '%' }"></div></div>
            <div v-if="item.comment" class="card-comment">{{ item.comment }}</div>
            <button class="dismiss-btn" title="忽略" @click="dismissInsight(item.dimension)">✕</button>
          </div>
        </div>
      </div>

      <!-- Weak Points -->
      <div v-if="data.weakPoints?.length" class="section">
        <div class="section-header weakness">
          <span class="section-icon">⚠️</span>
          <span class="section-title">需关注维度</span>
        </div>
        <div class="card-grid">
          <div v-for="item in data.weakPoints" :key="item.dimension" class="insight-card weakness-card">
            <div class="card-dim">{{ item.dimension }}</div>
            <div class="card-score" :style="{ color: '#F44336' }">{{ item.score }}</div>
            <div class="card-bar"><div class="card-bar-fill red" :style="{ width: item.score + '%' }"></div></div>
            <div v-if="item.suggestion" class="card-suggestion">
              <span class="sug-icon">💡</span>
              <span>{{ item.suggestion }}</span>
            </div>
            <button class="dismiss-btn" title="忽略" @click="dismissInsight(item.dimension)">✕</button>
          </div>
        </div>
      </div>

      <!-- Trends -->
      <div v-if="data.trends?.length" class="section">
        <div class="section-header trend">
          <span class="section-icon">📈</span>
          <span class="section-title">趋势变化</span>
        </div>
        <div class="trend-list">
          <div v-for="item in data.trends" :key="item.label" class="trend-item">
            <div class="trend-marker" :class="item.direction">
              <span v-if="item.direction === 'improving'">📈</span>
              <span v-else-if="item.direction === 'declining'">📉</span>
              <span v-else>📊</span>
            </div>
            <div class="trend-content">
              <div class="trend-label">{{ item.label }}</div>
              <div class="trend-detail">{{ item.detail }}</div>
            </div>
            <div class="trend-badge" :class="item.direction">
              {{ item.direction === 'improving' ? '↑ 好转' : item.direction === 'declining' ? '↓ 下降' : '→ 平稳' }}
            </div>
          </div>
        </div>
      </div>

      <!-- AI Suggestions -->
      <div v-if="data.suggestions?.length" class="section">
        <div class="section-header suggestion">
          <span class="section-icon">🤖</span>
          <span class="section-title">AI 建议</span>
        </div>
        <div class="suggestion-list">
          <div v-for="(item, i) in data.suggestions" :key="i" class="suggestion-item">
            <span class="sug-num">{{ i + 1 }}</span>
            <span class="sug-text">{{ item }}</span>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!hasData" class="empty-state">
        <div class="empty-icon">📊</div>
        <div class="empty-text">暂无分析数据</div>
        <div class="empty-hint">完成更多打卡和任务后，AI 将为你生成洞见分析</div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface TrendItem {
  label: string
  direction: 'improving' | 'declining' | 'stable'
  detail: string
}

interface DimensionItem {
  dimension: string
  score: number
  suggestion?: string
  comment?: string
}

interface InsightsData {
  weakPoints: DimensionItem[]
  strengths: DimensionItem[]
  trends: TrendItem[]
  suggestions: string[]
}

const data = ref<InsightsData>({
  weakPoints: [],
  strengths: [],
  trends: [],
  suggestions: []
})
const loading = ref(true)

const hasData = computed(() => {
  return data.value.weakPoints.length > 0 ||
    data.value.strengths.length > 0 ||
    data.value.trends.length > 0 ||
    data.value.suggestions.length > 0
})

const loadInsights = async () => {
  loading.value = true
  try {
    const res = await fetch('/api/insights')
    const result = await res.json()
    const all = (result.insights || [])

    data.value = {
      weakPoints: all.filter((i: any) => i.insight_type === 'weakness' || i.type === 'weakness'),
      strengths: all.filter((i: any) => i.insight_type === 'strength' || i.type === 'strength'),
      trends: all.filter((i: any) => i.insight_type === 'trend' || i.type === 'trend'),
      suggestions: all.filter((i: any) => i.insight_type === 'suggestion' || i.type === 'suggestion')
    }
  } catch (e) {
    console.error('加载洞见失败:', e)
    showToast('加载分析数据失败')
  }
  loading.value = false
}

const showToast = (msg: string) => {
  const el = document.createElement('div')
  el.className = 'toast toast-error'
  el.textContent = msg
  document.getElementById('toast-container')?.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

const generateInsights = async () => {
  try {
    await fetch('/api/insights/generate', { method: 'POST' })
    showToast('正在重新生成分析...')
    await loadInsights()
  } catch { showToast('生成失败') }
}

const dismissInsight = async (id: string) => {
  try {
    await fetch(`/api/insights/${id}/dismiss`, { method: 'POST' })
    showToast('已忽略')
    data.value.strengths = data.value.strengths.filter(s => s.dimension !== id)
    data.value.weakPoints = data.value.weakPoints.filter(w => w.dimension !== id)
  } catch { showToast('操作失败') }
}

onMounted(loadInsights)
</script>

<style scoped>
.insights-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }

.section { margin-bottom: 24px; }

.section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; padding: 10px 16px; border-radius: 10px; }
.section-header.strength { background: rgba(76, 175, 80, 0.08); }
.section-header.weakness { background: rgba(244, 67, 54, 0.08); }
.section-header.trend { background: rgba(33, 150, 243, 0.08); }
.section-header.suggestion { background: rgba(103, 58, 183, 0.08); }
.section-icon { font-size: 20px; }
.section-title { font-size: 15px; font-weight: 600; }

/* Card Grid */
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }

.insight-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 12px; padding: 16px;
}
.strength-card { border-top: 3px solid #4CAF50; }
.weakness-card { border-top: 3px solid #F44336; }

.card-dim { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.card-score { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
.card-bar { height: 4px; background: var(--bg-input); border-radius: 2px; margin-bottom: 8px; overflow: hidden; }
.card-bar-fill { height: 100%; border-radius: 2px; transition: width 0.6s; }
.card-bar-fill.green { background: #4CAF50; }
.card-bar-fill.red { background: #F44336; }
.card-comment { font-size: 12px; color: var(--text-dim); }
.card-suggestion { display: flex; gap: 6px; font-size: 12px; color: var(--text-dim); align-items: flex-start; }
.sug-icon { flex-shrink: 0; }

/* Trends */
.trend-list { display: flex; flex-direction: column; gap: 10px; }

.trend-item {
  display: flex; align-items: center; gap: 14px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 12px; padding: 14px 16px;
}

.trend-marker { font-size: 24px; width: 36px; text-align: center; }
.trend-content { flex: 1; }
.trend-label { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
.trend-detail { font-size: 12px; color: var(--text-dim); }

.trend-badge {
  font-size: 11px; padding: 4px 10px; border-radius: 20px;
  font-weight: 600; white-space: nowrap;
}
.trend-badge.improving { background: rgba(76, 175, 80, 0.15); color: #4CAF50; }
.trend-badge.declining { background: rgba(244, 67, 54, 0.15); color: #F44336; }
.trend-badge.stable { background: rgba(158, 158, 158, 0.15); color: #9E9E9E; }

/* Suggestions */
.suggestion-list { display: flex; flex-direction: column; gap: 10px; }

.suggestion-item {
  display: flex; align-items: center; gap: 12px;
  background: var(--bg-card); border: 1px solid rgba(103, 58, 183, 0.2);
  border-radius: 12px; padding: 14px 16px;
}
.sug-num {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--primary); color: white; font-size: 12px; font-weight: 600; flex-shrink: 0;
}
.sug-text { font-size: 14px; line-height: 1.5; }

/* Empty */
.empty-state { text-align: center; padding: 60px 20px; color: var(--text-dim); }
.empty-icon { font-size: 48px; margin-bottom: 12px; }
.empty-text { font-size: 16px; margin-bottom: 4px; }
.empty-hint { font-size: 13px; }

/* Loading */
.loading-state { display: flex; flex-direction: column; gap: 16px; }
.skeleton-section {
  height: 120px; background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-input) 50%, var(--bg-card) 75%);
  border-radius: 12px; animation: shimmer 1.5s infinite; background-size: 200% 100%;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; }
.btn-primary { background: var(--primary); color: white; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm { padding: 6px 12px; font-size: 12px; }

@media (max-width: 768px) { .card-grid { grid-template-columns: 1fr; } }

.dismiss-btn {
  position: absolute; top: 8px; right: 8px;
  background: none; border: none; color: var(--text-dim);
  cursor: pointer; font-size: 14px; padding: 2px 6px;
  border-radius: 4px; transition: all 0.2s;
}
.dismiss-btn:hover { background: rgba(244,67,54,0.15); color: #F44336; }
.insight-card { position: relative; }
</style>
