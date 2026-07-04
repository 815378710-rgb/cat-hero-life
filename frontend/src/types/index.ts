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

// ===== 神经智能系统类型 =====

export interface EnergyLevel {
  level: 'burst' | 'high' | 'normal' | 'low' | 'exhausted'
  label: string
  color: string
  suggestion: string
  maxDifficulty: string
}

export interface EnergyBreakdownItem {
  value: number
  impact: number
  label: string
}

export interface EnergyData {
  energy: number
  level: EnergyLevel
  breakdown: Record<string, EnergyBreakdownItem>
}

export interface BalanceSnapshot {
  dimValues: Record<string, number>
  shapeType: string
  balanceScore: number
  narrative: string
}

export interface NeuralMatrix {
  matrix: Record<string, Record<string, number>>
}

export interface PropagationChange {
  dim: string
  from: number
  to: number
  delta: number
  depth: number
  source: string | null
}

export interface FeedbackCycle {
  path: string[]
  count: number
  type: 'positive' | 'negative'
  totalDelta: number
  description: string
}

export interface CatForm {
  id: number
  level_required: number
  form_name: string
  form_emoji: string
  description: string
  abilities: string
}

export interface Title {
  id: string
  name: string
  icon: string
  description: string
  rarity: string
  is_active?: boolean
  unlocked_at?: string
}

export interface QuestChain {
  id: string
  chain_name: string
  dimension_id: string
  description: string
  total_steps: number
  steps: QuestStep[]
  progress?: { current_step: number; status: string }
}

export interface QuestStep {
  id: string
  step_number: number
  title: string
  task_type: string
  target_value: number
  exp_reward: number
  coin_reward: number
  bonus_text: string
}

export interface SocialPerson {
  id: string
  name: string
  relationship: string
  closeness: number
  influence: number
  lastContact: string | null
  frequency: number
}

export interface DecisionEvent {
  id: string
  decision_text: string
  dimension_affected: string
  decided_at: string
  outcomes: DecisionOutcome[]
}

export interface DecisionOutcome {
  id: string
  check_type: string
  verdict: 'positive' | 'negative' | 'neutral'
  narrative: string
  delta: Record<string, number>
}

export interface MemoryStats {
  working: number
  shortTerm: number
  longTerm: number
  total: number
}

export interface PersonalityEvolution {
  [context: string]: { style: string; effectiveness: number; samples: number }[]
}

export interface LifecycleStage {
  stage: string
  age: number
  name: string
  focus: string[]
  taskBias: Record<string, number>
  tone: string
}

export interface HabitStack {
  id: string
  anchor_name: string
  anchor_icon: string
  new_habit_name: string
  new_habit_icon: string
  anchor_moment: string
  success_count: number
  fail_count: number
  streak: number
  status: string
}
