// 猫猫侠 - 神经智能系统状态管理

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { EnergyData, BalanceSnapshot, CatForm, Title, SocialPerson, MemoryStats, DecisionEvent, HabitStack } from '@/types'
import { neuralApi } from '@/api'

export const useNeuralStore = defineStore('neural', () => {
  // Energy
  const energy = ref<EnergyData | null>(null)
  const energyCurve = ref<{ hour: number; energy: number }[]>([])

  // Balance
  const balance = ref<BalanceSnapshot | null>(null)
  const balanceTrend = ref<any[]>([])

  // Cat Evolution
  const catForm = ref<CatForm | null>(null)
  const nextForm = ref<CatForm | null>(null)

  // Titles
  const titles = ref<Title[]>([])
  const newTitleUnlocks = ref<Title[]>([])

  // Social
  const socialGraph = ref<SocialPerson[]>([])
  const socialInsights = ref<any[]>([])

  // Memory
  const memoryStats = ref<MemoryStats>({ working: 0, shortTerm: 0, longTerm: 0, total: 0 })

  // Decisions
  const decisions = ref<DecisionEvent[]>([])

  // Habit Stacking
  const stacks = ref<HabitStack[]>([])

  // Cycles
  const cycles = ref<any[]>([])

  // Personality
  const personalityEvolution = ref<any>({})

  // Loading
  const loading = ref(false)

  // Computed
  const energyPercent = computed(() => energy.value?.energy || 0)
  const energyLevel = computed(() => energy.value?.level?.label || '加载中')
  const balanceScore = computed(() => balance.value?.balanceScore || 0)
  const shapeType = computed(() => balance.value?.shapeType || 'unknown')
  const activeTitles = computed(() => titles.value.filter(t => t.is_active))

  // Actions
  async function fetchAll() {
    loading.value = true
    try {
      const [energyRes, balanceRes, formRes, titlesRes, socialRes, insightsRes, memRes, decisionsRes, cyclesRes, personalityRes, stacksRes] = await Promise.allSettled([
        neuralApi.getEnergy(),
        neuralApi.getBalance(),
        neuralApi.getCatForm(),
        neuralApi.getTitles(),
        neuralApi.getSocialGraph(),
        neuralApi.getSocialInsights(),
        neuralApi.getMemoryStats(),
        neuralApi.getDecisions(),
        neuralApi.getCycles(),
        neuralApi.getPersonality(),
        neuralApi.getStacks(),
      ])

      if (energyRes.status === 'fulfilled') energy.value = energyRes.value
      if (balanceRes.status === 'fulfilled') balance.value = balanceRes.value
      if (formRes.status === 'fulfilled') { catForm.value = formRes.value.current; nextForm.value = formRes.value.next }
      if (titlesRes.status === 'fulfilled') { titles.value = titlesRes.value.titles; newTitleUnlocks.value = titlesRes.value.newUnlocks }
      if (socialRes.status === 'fulfilled') socialGraph.value = socialRes.value.graph
      if (insightsRes.status === 'fulfilled') socialInsights.value = insightsRes.value.insights
      if (memRes.status === 'fulfilled') memoryStats.value = memRes.value
      if (decisionsRes.status === 'fulfilled') decisions.value = decisionsRes.value.decisions?.slice(0, 5) || []
      if (cyclesRes.status === 'fulfilled') cycles.value = cyclesRes.value.cycles
      if (personalityRes.status === 'fulfilled') personalityEvolution.value = personalityRes.value.evolution
      if (stacksRes.status === 'fulfilled') stacks.value = stacksRes.value.stacks
    } catch (e) {
      console.error('Failed to fetch neural data:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchEnergy() {
    try { energy.value = await neuralApi.getEnergy() } catch {}
  }

  async function fetchBalance() {
    try { balance.value = await neuralApi.getBalance() } catch {}
  }

  async function equipTitle(titleId: string) {
    try {
      await neuralApi.equipTitle(titleId)
      const res = await neuralApi.getTitles()
      titles.value = res.titles
    } catch {}
  }

  return {
    energy, energyCurve, balance, balanceTrend,
    catForm, nextForm, titles, newTitleUnlocks,
    socialGraph, socialInsights, memoryStats,
    decisions, stacks, cycles, personalityEvolution,
    loading,
    energyPercent, energyLevel, balanceScore, shapeType, activeTitles,
    fetchAll, fetchEnergy, fetchBalance, equipTitle,
  }
})
