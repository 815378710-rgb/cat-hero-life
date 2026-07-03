<template>
  <div class="heatmap-container">
    <div class="heatmap-header">
      <h3>📅 打卡热力图</h3>
      <div class="legend">
        <span class="legend-item"><i class="dot" style="background:#ebedf0"></i>无</span>
        <span class="legend-item"><i class="dot" style="background:#9be9a8"></i>少</span>
        <span class="legend-item"><i class="dot" style="background:#40c463"></i>中</span>
        <span class="legend-item"><i class="dot" style="background:#30a14e"></i>多</span>
      </div>
    </div>
    
    <div class="heatmap-grid">
      <div class="days-labels">
        <span></span>
        <span>一</span>
        <span></span>
        <span>三</span>
        <span></span>
        <span>五</span>
        <span></span>
      </div>
      <div class="grid-body">
        <div class="month-labels">
          <span v-for="(month, i) in monthLabels" :key="i" :style="getMonthStyle(i)">{{ month }}</span>
        </div>
        <div class="heatmap-cells">
          <div 
            v-for="(week, wi) in weeks" 
            :key="wi" 
            class="week"
          >
            <div 
              v-for="(day, di) in week" 
              :key="`${wi}-${di}`"
              class="day-cell"
              :style="{ backgroundColor: getColor(day.count) }"
              :title="day.date ? `${day.date}: ${day.count}次打卡` : ''"
            ></div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="heatmap-stats">
      <div class="stat">
        <span class="stat-value">{{ totalCheckins }}</span>
        <span class="stat-label">总打卡</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ currentStreak }}</span>
        <span class="stat-label">连续天数</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ maxStreak }}</span>
        <span class="stat-label">最长连续</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';

interface DayData {
  date: string;
  count: number;
  isToday: boolean;
}

const days = 365;
const weeks = ref<DayData[][]>([]);
const totalCheckins = ref(0);
const currentStreak = ref(0);
const maxStreak = ref(0);

const monthLabels = computed(() => {
  const labels: string[] = [];
  const today = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    labels.push(`${d.getMonth() + 1}月`);
  }
  return labels;
});

function getMonthStyle(index: number) {
  // Approximate column position for month labels
  const weeksPerMonth = 4.3;
  const leftPercent = index * (100 / 12);
  return { left: `${leftPercent}%` };
}

function getColor(count: number): string {
  if (count === 0) return '#ebedf0';
  if (count <= 2) return '#9be9a8';
  if (count <= 5) return '#40c463';
  return '#30a14e';
}

async function loadData() {
  try {
    const res = await fetch(`/api/checkins/heatmap?days=${days}`);
    const data = await res.json();
    
    weeks.value = data.weeks || generateMockWeeks();
    totalCheckins.value = data.total || 0;
    currentStreak.value = data.currentStreak || 0;
    maxStreak.value = data.maxStreak || 0;
  } catch (err) {
    console.error('Failed to load heatmap:', err);
    weeks.value = generateMockWeeks();
  }
}

function generateMockWeeks(): DayData[][] {
  const weeks: DayData[][] = [];
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days);
  
  let currentWeek: DayData[] = [];
  
  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    const dateStr = d.toISOString().split('T')[0];
    const isToday = d.toDateString() === today.toDateString();
    
    currentWeek.push({
      date: dateStr,
      count: Math.random() > 0.6 ? Math.floor(Math.random() * 8) : 0,
      isToday
    });
    
    if (dayOfWeek === 0 || d.toDateString() === today.toDateString()) {
      weeks.push([...currentWeek]);
      currentWeek = [];
    }
  }
  
  return weeks;
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.heatmap-container {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  overflow-x: auto;
}

.heatmap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap; gap: 8px;
}

.heatmap-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text);
}

.legend {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--text-dim);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.heatmap-grid {
  display: flex;
  gap: 4px;
}

.days-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 3px;
  font-size: 10px;
  color: var(--text-dim);
  padding-top: 16px;
  height: 100%;
}

.days-labels span {
  height: 12px;
  line-height: 12px;
}

.grid-body {
  flex: 1;
  min-width: 0;
}

.month-labels {
  position: relative;
  height: 16px;
  margin-bottom: 4px;
}

.month-labels span {
  position: absolute;
  font-size: 10px;
  color: var(--text-dim);
}

.heatmap-cells {
  display: flex;
  gap: 3px;
}

.week {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.day-cell {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  background: var(--bg-input);
  transition: transform 0.15s;
}

.day-cell:hover {
  transform: scale(1.6);
  z-index: 10;
  outline: 1px solid var(--primary);
}

.heatmap-stats {
  display: flex;
  justify-content: space-around;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: var(--primary);
}

.stat-label {
  font-size: 12px;
  color: var(--text-dim);
  margin-top: 4px;
}
</style>
