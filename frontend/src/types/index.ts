// 猫猫侠 TypeScript 类型定义

export interface User {
  id: string
  username: string
  avatar_url: string | null
  personality_type: string
  personality_prompt: string | null
  monthly_income: number
  monthly_budget: number
  reward_pool_percent: number
  stat_health: number
  stat_finance: number
  stat_learning: number
  stat_career: number
  stat_social: number
  stat_mental: number
  stat_habits: number
  stat_creativity: number
  level: number
  exp: number
  coins: number
  total_exp: number
  consecutive_sign_days: number
  last_sign_date: string | null
  created_at: string
  updated_at: string
}

export interface LifeProfile {
  id: string
  user_id: string
  gender: string | null
  birth_year: number | null
  city: string | null
  mbti: string | null
  current_job: string | null
  industry: string | null
  education_level: string | null
  marital_status: string | null
  personality_traits: string | null
  strengths: string | null
  weaknesses: string | null
  hobbies: string | null
  skills: string | null
  want_to_learn: string | null
  current_challenges: string | null
  ideal_life_description: string | null
  ideal_self_description: string | null
  onboarding_completed: number
  onboarding_step: number
}

export interface Task {
  id: string
  user_id: string
  goal_id: string | null
  dimension_id: string
  title: string
  description: string | null
  task_type: string
  difficulty: 'easy' | 'medium' | 'hard' | 'epic'
  exp_reward: number
  coin_reward: number
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
  scheduled_date: string | null
  completed_at: string | null
  dimension_name?: string
  dimension_icon?: string
  dimension_color?: string
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  category: string | null
  condition_type: string
  condition_value: number
  exp_reward: number
  coin_reward: number
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  unlocked?: boolean
}

export interface ShopItem {
  id: string
  name: string
  description: string
  icon: string
  category: string
  price: number
  item_type: string
  real_reward_desc: string | null
}

export interface ChatMessage {
  id: number
  user_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata: string | null
  created_at: string
}

export interface MoodData {
  mood: 'ecstatic' | 'happy' | 'neutral' | 'sad' | 'devastated'
  emoji: string
  score: number
  description: string
}

export interface EnergyData {
  energy: number
  level: string
  label: string
  color: string
  suggestion: string
}

export interface WeatherData {
  city: string
  temp: number | null
  description: string
  isRainy: boolean
  isCold: boolean
  isHot: boolean
}

export interface DimensionStat {
  id: string
  name: string
  icon: string
  color: string
  value: number
}

export interface LifeDimension {
  health: number
  finance: number
  learning: number
  career: number
  social: number
  mental: number
  habits: number
  creativity: number
}

export interface DashboardData {
  user: User
  todayTasks: Task[]
  todayCheckins: number
  recentAchievements: Achievement[]
  streak: { consecutive_sign_days: number; last_sign_date: string | null }
  dimensionStats: DimensionStat[]
}

export interface GrowthData {
  level: number
  unlocked: { feature: string; name: string; description: string; icon: string }[]
  next: { level: number; feature: string; name: string; description: string; icon: string } | null
  mood: MoodData
}

export interface ApiResponse<T = any> {
  success?: boolean
  message?: string
  data?: T
  error?: string
}
