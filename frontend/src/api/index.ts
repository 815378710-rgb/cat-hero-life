// 猫猫侠 API 客户端

import axios from 'axios'
import type { 
  User, DashboardData, Task, Achievement, ShopItem, 
  ChatMessage, MoodData, EnergyData, WeatherData, 
  GrowthData, LifeProfile 
} from '@/types'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

// 请求拦截器 - Loading
let loadingCount = 0
const showLoading = () => {
  loadingCount++
  document.getElementById('global-loading')?.classList.add('active')
}
const hideLoading = () => {
  loadingCount--
  if (loadingCount <= 0) {
    loadingCount = 0
    document.getElementById('global-loading')?.classList.remove('active')
  }
}

api.interceptors.request.use(config => {
  showLoading()
  return config
})

api.interceptors.response.use(
  response => { hideLoading(); return response.data },
  error => {
    hideLoading()
    const message = error.response?.data?.error || error.message || '请求失败'
    console.error('API Error:', message)
    throw new Error(message)
  }
)

// ===== User API =====
export const userApi = {
  getProfile: () => api.get<any, User>('/user/profile'),
  getStats: () => api.get<any, { stats: Record<string, number>; total: number }>('/user/stats'),
  signin: () => api.post<any, { success: boolean; message: string; exp: number; coins: number; streak: number }>('/user/signin'),
  updateProfile: (data: Partial<User>) => api.put('/user/profile', data),
}

// ===== Dashboard API =====
export const dashboardApi = {
  getDashboard: () => api.get<any, DashboardData>('/dashboard'),
}

// ===== Task API =====
export const taskApi = {
  getTasks: (params?: { status?: string; date?: string }) => api.get<any, { tasks: Task[]; grouped: Record<string, Task[]> }>('/tasks', { params }),
  createTask: (data: Partial<Task>) => api.post<any, { success: boolean; id: string }>('/tasks', data),
  completeTask: (id: string) => api.post<any, { success: boolean; message: string; exp: number; coins: number; level_up: boolean }>(`/tasks/${id}/complete`),
  generateSmart: () => api.post<any, { success: boolean; count: number; energy: number }>('/tasks/generate-smart'),
  generateDaily: () => api.post<any, { success: boolean; count: number }>('/tasks/generate-daily'),
}

// ===== Checkin API =====
export const checkinApi = {
  checkin: (data: { dimension_id: string; title: string; value?: number }) => api.post<any, { success: boolean; exp: number; coins: number }>('/checkins', data),
  getToday: () => api.get<any, { total: number; summary: any[] }>('/checkins/today'),
}

// ===== Gamification API =====
export const gamificationApi = {
  getLevel: () => api.get<any, { level: number; exp: number; exp_for_next: number; exp_progress: number; coins: number }>('/gamification/level'),
  getRadar: () => api.get<any, { radar: { dimension: string; name: string; icon: string; color: string; value: number }[]; total_power: number }>('/gamification/radar'),
  getAchievements: () => api.get<any, { achievements: Achievement[]; total: number; unlocked: number }>('/gamification/achievements'),
  checkAchievements: () => api.post<any, { success: boolean; new_achievements: Achievement[] }>('/gamification/check-achievements'),
  getStreak: () => api.get<any, { streak: number; signed_today: boolean }>('/gamification/streak'),
}

// ===== Chat API =====
export const chatApi = {
  getHistory: (limit?: number) => api.get<any, { messages: ChatMessage[] }>('/chat/history', { params: { limit } }),
  send: (message: string) => api.post<any, { response: string; actions: string[]; metadata: any; mood: MoodData }>('/chat/send', { message }),
  getGrowth: () => api.get<any, GrowthData>('/chat/growth'),
}

// ===== Shop API =====
export const shopApi = {
  getItems: () => api.get<any, { items: ShopItem[] }>('/shop/items'),
  purchase: (itemId: string) => api.post<any, { success: boolean; message: string; remaining_coins: number }>(`/shop/purchase/${itemId}`),
  getPurchases: () => api.get<any, { purchases: any[] }>('/shop/purchases'),
}

// ===== Life Tools API =====
export const lifeToolsApi = {
  getWeather: () => api.get<any, { weather: WeatherData }>('/life-tools/weather'),
  getCatStatus: () => api.get<any, { cat_level: number; cat_exp: number; abilities: string[] }>('/life-tools/cat/status'),
  addCatExp: (amount: number) => api.post<any, { success: boolean; level: number; levelUp: boolean }>('/life-tools/cat/exp', { amount }),
}

// ===== Profile API =====
export const profileApi = {
  getProfile: () => api.get<any, { profile: LifeProfile }>('/profile'),
  updateProfile: (data: Partial<LifeProfile>) => api.put('/profile', data),
  getOnboardingQuestions: () => api.get<any, { step: number; total_steps: number; questions: any[] }>('/profile/onboarding-questions'),
  submitOnboardingAnswer: (answers: Record<string, any>) => api.post<any, { success: boolean; step: number; completed: boolean; message: string }>('/profile/onboarding-answer', { answers }),
}

// ===== Onboarding API (conversational) =====
export const onboardingApi = {
  start: () => api.post<any, { success: boolean; message: string; step: number; completed: boolean }>('/onboarding/start'),
  chat: (message: string) => api.post<any, { success: boolean; response: string; step: number; completed: boolean; extracted: Record<string, any> }>('/onboarding/chat', { message }),
}

// ===== Habit API =====
export const habitApi = {
  getHabits: () => api.get<any, { habits: any[] }>('/habits'),
  logHabit: (id: string, count?: number) => api.post<any, { success: boolean; streak: number }>(`/habits/${id}/log`, { count: count || 1 }),
}

// ===== Goal API =====
export const goalApi = {
  getGoals: () => api.get<any, { goals: any[] }>('/goals'),
  createGoal: (data: any) => api.post<any, { success: boolean; id: string }>('/goals', data),
}

// ===== Deep Data API =====
export const deepApi = {
  getHealthDashboard: () => api.get('/deep/health/dashboard'),
  getFinanceDashboard: () => api.get('/deep/finance/dashboard'),
  getMentalDashboard: () => api.get('/deep/mental/dashboard'),
  getBalanceWheel: () => api.get<any, { scores: Record<string, number>; average: number }>('/deep/balance-wheel'),
  getAlerts: () => api.get<any, { alerts: any[]; count: number }>('/deep/alerts'),
  getTimeline: () => api.get<any, { events: any[] }>('/deep/timeline'),
  getTrends: (dim: string) => api.get(`/deep/trends/${dim}`),
  getCorrelations: () => api.get('/deep/correlations'),
  getRecommendations: () => api.get<any, { recommendations: any[] }>('/deep/recommendations'),
}

// ===== Narrative API =====
export const narrativeApi = {
  getChapters: () => api.get<any, { chapters: any[] }>('/narrative/chapters'),
  generate: () => api.post<any, { success: boolean; chapter: any }>('/narrative/generate'),
}

// ===== Report API =====
export const reportApi = {
  getDaily: () => api.get('/reports/daily'),
  getWeekly: () => api.get<any>('/life-dashboard/weekly-review'),
}

// ===== Memory API =====
export const memoryApi = {
  getMemories: (limit?: number) => api.get<any, { memories: any[] }>('/memory', { params: { limit } }),
}

// ===== AI Config API =====
export const aiConfigApi = {
  getConfig: () => api.get<any, { config: any; enabled: boolean }>('/ai/config'),
  updateConfig: (data: { provider: string; apiKey: string; model: string }) => api.put('/ai/config', data),
}

export default api
