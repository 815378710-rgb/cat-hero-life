<template>
  <div class="shop-page">
    <div class="page-header"><h2>🛒 猫猫商店</h2><span class="coins">🪙 {{ coins }}</span></div>
    <div class="shop-grid">
      <div v-for="item in items" :key="item.id" class="shop-item" @click="buy(item)">
        <div class="item-icon">{{ item.icon }}</div>
        <div class="item-name">{{ item.name }}</div>
        <div class="item-desc">{{ item.description || item.real_reward_desc || '' }}</div>
        <div class="item-price">🪙 {{ item.price }}</div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { shopApi } from '@/api'
import { useUserStore } from '@/stores/user'
const userStore = useUserStore()
const items = ref<any[]>([])
const coins = computed(() => userStore.coins)
onMounted(async () => { items.value = (await shopApi.getItems()).items || [] })
const buy = async (item: any) => {
  if (!confirm(`确认用 ${item.price} 金币购买「${item.name}」？`)) return
  const res = await shopApi.purchase(item.id)
  alert(res.message)
  if (res.success) { await userStore.fetchUser(); items.value = (await shopApi.getItems()).items || [] }
}
</script>
<style scoped>
.shop-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.coins { font-size: 18px; font-weight: 700; color: var(--accent); }
.shop-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.shop-item { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; text-align: center; cursor: pointer; transition: all 0.2s; }
.shop-item:hover { border-color: var(--primary); transform: translateY(-2px); }
.item-icon { font-size: 40px; margin-bottom: 12px; }
.item-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.item-desc { font-size: 11px; color: var(--text-dim); margin-bottom: 12px; }
.item-price { font-size: 16px; font-weight: 700; color: var(--accent); }
</style>
