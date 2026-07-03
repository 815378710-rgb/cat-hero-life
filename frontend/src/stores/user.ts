// 猫猫侠 - 用户状态管理

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User, LifeProfile, MoodData, EnergyData } from '@/types'
import { userApi, profileApi, lifeToolsApi } from '@/api'

export const useUserStore = defineStore('user', () => {
  // State
  const user = ref<User | null>(null)
  const profile = ref<LifeProfile | null>(null)
  const mood = ref<MoodData | null>(null)
  const energy = ref<EnergyData | null>(null)
  const loading = ref(false)

  // Getters
  const level = computed(() => user.value?.level || 1)
  const coins = computed(() => user.value?.coins || 0)
  const streak = computed(() => user.value?.consecutive_sign_days || 0)
  const username = computed(() => user.value?.username || '主人')
  const expProgress = computed(() => {
    if (!user.value) return 0
    const getExpForLevel = (l: number) => Math.floor(100 * Math.pow(1.15, l - 1))
    const expForNext = getExpForLevel(user.value.level + 1)
    return Math.round((user.value.exp / expForNext) * 100)
  })
  const needsOnboarding = computed(() => !profile.value?.onboarding_completed)

  // Stats
  const stats = computed(() => {
    if (!user.value) return {}
    return {
      health: user.value.stat_health,
      finance: user.value.stat_finance,
      learning: user.value.stat_learning,
      career: user.value.stat_career,
      social: user.value.stat_social,
      mental: user.value.stat_mental,
      habits: user.value.stat_habits,
      creativity: user.value.stat_creativity,
    }
  })

  const totalPower = computed(() => {
    return Object.values(stats.value).reduce((a, b) => a + b, 0)
  })

  // Actions
  async function fetchUser() {
    loading.value = true
    try {
      user.value = await userApi.getProfile()
    } catch (e) {
      console.error('Failed to fetch user:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchProfile() {
    try {
      const res = await profileApi.getProfile()
      profile.value = res.profile
    } catch (e) {
      console.error('Failed to fetch profile:', e)
    }
  }

  async function signin() {
    try {
      const res = await userApi.signin()
      if (res.success) {
        await fetchUser()
      }
      return res
    } catch (e) {
      console.error('Failed to signin:', e)
      return { success: false, message: '签到失败' }
    }
  }

  async function fetchMood() {
    try {
      const res = await lifeToolsApi.getCatStatus()
      // Map cat status to mood
      mood.value = {
        mood: 'happy',
        emoji: '😺',
        score: 68,
        description: '心情不错'
      }
    } catch (e) {}
  }

  async function fetchEnergy() {
    try {
      const res = await import('@/api').then(m => m.deepApi.getBalanceWheel())
      energy.value = { energy: res.average, level: 'ok', label: '状态不错', color: '#4CAF50', suggestion: '' } as any
    } catch (e) {}
  }

  async function updateProfile(data: Partial<LifeProfile>) {
    try {
      await profileApi.updateProfile(data)
      await fetchProfile()
    } catch (e) {
      console.error('Failed to update profile:', e)
    }
  }

  return {
    user, profile, mood, energy, loading,
    level, coins, streak, username, expProgress, needsOnboarding,
    stats, totalPower,
    fetchUser, fetchProfile, signin, fetchMood, fetchEnergy, updateProfile
  }
})
