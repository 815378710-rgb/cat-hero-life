<template>
  <div class="profile-page">
    <h2>👤 {{ t('profile.title') }}</h2>
    <div class="card">
      <div class="info-row"><span class="lbl">{{ t('profile.level') }}</span><span class="val">Lv.{{ level }}</span></div>
      <div class="info-row"><span class="lbl">{{ t('profile.xp') }}</span><span class="val">{{ xp }}</span></div>
      <div class="info-row"><span class="lbl">{{ t('profile.coins') }}</span><span class="val">🪙 {{ coins }}</span></div>
      <div class="info-row"><span class="lbl">{{ t('profile.memberSince') }}</span><span class="val">{{ created }}</span></div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <button class="share-btn" @click="generateShareCard">📤 生成分享卡</button>
      <button class="lang-btn" @click="toggleLang">{{ locale === 'zh-CN' ? '🇨🇳 中文' : '🇺🇸 English' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { setLocale } from '@/i18n'

const { t, locale } = useI18n()
const level = ref(1)
const xp = ref(0)
const coins = ref(0)
const created = ref('')

const toggleLang = () => {
  setLocale(locale.value === 'zh-CN' ? 'en' : 'zh-CN')
}

const showToast = (msg: string) => {
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = msg
  document.getElementById('toast-container')?.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

const generateShareCard = async () => {
  try {
    const res = await fetch('/api/social/share-card')
    const data = await res.json()
    showToast(data.message || '分享卡已生成')
  } catch { showToast('生成失败') }
}

onMounted(async () => {
  try {
    const res = await fetch('/api/user/profile')
    const data = await res.json()
    level.value = data.level || 1
    xp.value = data.exp || 0
    coins.value = data.coins || 0
    created.value = data.created_at?.split('T')[0] || ''
  } catch (e) {}
})
</script>

<style scoped>
.profile-page h2 { font-size: 22px; margin-bottom: 20px; }
.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); }
.info-row:last-child { border-bottom: none; }
.lbl { color: var(--text-dim); font-size: 14px; }
.val { font-weight: 600; font-size: 15px; }
.lang-btn { padding: 10px 20px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text); cursor: pointer; font-size: 14px; }
.lang-btn:hover { border-color: var(--primary); }
.share-btn { padding: 10px 20px; border-radius: 8px; border: none; background: var(--primary); color: white; cursor: pointer; font-size: 14px; font-weight: 600; }
.share-btn:hover { opacity: 0.9; }
</style>
