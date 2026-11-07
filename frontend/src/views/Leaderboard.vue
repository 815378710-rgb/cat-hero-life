<template>
  <div class="leaderboard-page">
    <div class="page-header">
      <h2>🏆 排行榜</h2>
      <div class="tabs">
        <button v-for="t in types" :key="t.key" class="tab" :class="{ active: activeType === t.key }" @click="switchType(t.key)">
          {{ t.label }}
        </button>
      </div>
    </div>

    <div class="leaderboard-list">
      <div v-for="(user, i) in leaderboard" :key="user.id" class="rank-card" :class="'rank-' + (i + 1)">
        <div class="rank-number">
          <span v-if="i === 0">🥇</span>
          <span v-else-if="i === 1">🥈</span>
          <span v-else-if="i === 2">🥉</span>
          <span v-else>#{{ i + 1 }}</span>
        </div>
        <div class="rank-avatar">{{ getCatEmoji(user.level) }}</div>
        <div class="rank-info">
          <div class="rank-name">{{ user.username || '匿名猫侠' }}</div>
          <div class="rank-level">Lv.{{ user.level }} · {{ getTitle(user.level) }}</div>
        </div>
        <div class="rank-value">{{ formatValue(user.value) }}</div>
      </div>
      <div v-if="leaderboard.length === 0" class="empty">暂无数据，快去打卡吧~</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const types = [
  { key: 'power', label: '综合战力' },
  { key: 'level', label: '等级排行' },
  { key: 'streak', label: '连续打卡' },
  { key: 'coins', label: '金币排行' },
  { key: 'weekly', label: '本周活跃' }
]
const activeType = ref('power')
const leaderboard = ref<any[]>([])

const switchType = async (type: string) => {
  activeType.value = type
  await loadData()
}

const loadData = async () => {
  try {
    const res = await fetch(`/api/social/leaderboard?type=${activeType.value}&limit=20`)
    const data = await res.json()
    leaderboard.value = data.leaderboard || []
  } catch (e) {}
}

const getCatEmoji = (level: number) => {
  if (level >= 50) return '🐯'
  if (level >= 30) return '🦁'
  if (level >= 20) return '🐆'
  if (level >= 10) return '🐱'
  if (level >= 5) return '🐈'
  return '🐣'
}

const getTitle = (level: number) => {
  if (level >= 50) return '传奇猫侠'
  if (level >= 30) return '宗师猫侠'
  if (level >= 20) return '精英猫侠'
  if (level >= 10) return '高级猫侠'
  if (level >= 5) return '猫猫学徒'
  return '新手小猫'
}

const formatValue = (v: number) => {
  if (activeType.value === 'coins') return `🪙 ${v}`
  if (activeType.value === 'streak') return `🔥 ${v}天`
  if (activeType.value === 'weekly') return `📅 ${v}次`
  return `⚡ ${v}`
}

onMounted(loadData)
</script>

<style scoped>
.leaderboard-page { max-width: 600px; margin: 0 auto; }
.page-header { margin-bottom: 20px; }
.page-header h2 { font-size: 22px; margin-bottom: 12px; }
.tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.tab {
  padding: 6px 14px; border-radius: 20px; border: 1px solid var(--border);
  background: var(--bg-card); color: var(--text-dim); font-size: 13px; cursor: pointer; transition: all 0.2s;
}
.tab.active { background: var(--primary); color: white; border-color: var(--primary); }
.tab:hover:not(.active) { border-color: var(--primary); color: var(--primary); }

.rank-card {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; margin-bottom: 8px;
  background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border);
  transition: transform 0.2s;
}
.rank-card:hover { transform: translateX(4px); }
.rank-card.rank-1 { border-color: #FFD700; background: linear-gradient(135deg, rgba(255,215,0,0.1), var(--bg-card)); }
.rank-card.rank-2 { border-color: #C0C0C0; background: linear-gradient(135deg, rgba(192,192,192,0.1), var(--bg-card)); }
.rank-card.rank-3 { border-color: #CD7F32; background: linear-gradient(135deg, rgba(205,127,50,0.1), var(--bg-card)); }

.rank-number { font-size: 18px; font-weight: 700; width: 40px; text-align: center; }
.rank-avatar { font-size: 28px; }
.rank-info { flex: 1; }
.rank-name { font-weight: 600; font-size: 15px; }
.rank-level { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
.rank-value { font-weight: 700; font-size: 16px; color: var(--primary); }
.empty { text-align: center; padding: 40px; color: var(--text-dim); }
</style>
