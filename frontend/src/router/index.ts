// 猫猫侠 - 路由配置

import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'dashboard', component: () => import('@/views/Dashboard.vue') },
  { path: '/chat', name: 'chat', component: () => import('@/views/Chat.vue') },
  { path: '/tasks', name: 'tasks', component: () => import('@/views/Tasks.vue') },
  { path: '/checkin', name: 'checkin', component: () => import('@/views/Checkin.vue') },
  { path: '/habits', name: 'habits', component: () => import('@/views/Habits.vue') },
  { path: '/goals', name: 'goals', component: () => import('@/views/Goals.vue') },
  { path: '/character', name: 'character', component: () => import('@/views/Character.vue') },
  { path: '/achievements', name: 'achievements', component: () => import('@/views/Achievements.vue') },
  { path: '/shop', name: 'shop', component: () => import('@/views/Shop.vue') },
  { path: '/onboarding', name: 'onboarding', component: () => import('@/views/Onboarding.vue') },
  { path: '/plans', name: 'plans', component: () => import('@/views/Plans.vue') },
  { path: '/memory', name: 'memory', component: () => import('@/views/Memory.vue') },
  { path: '/narrative', name: 'narrative', component: () => import('@/views/Narrative.vue') },
  { path: '/settings', name: 'settings', component: () => import('@/views/Settings.vue') },
  { path: '/heatmap', name: 'heatmap', component: () => import('@/views/Heatmap.vue') },
  { path: '/leaderboard', name: 'leaderboard', component: () => import('@/views/Leaderboard.vue') },
  { path: '/coach', name: 'coach', component: () => import('@/views/AICoach.vue') },
  { path: '/stats', name: 'stats', component: () => import('@/views/Stats.vue') },
  { path: '/profile', name: 'profile', component: () => import('@/views/Profile.vue') },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
