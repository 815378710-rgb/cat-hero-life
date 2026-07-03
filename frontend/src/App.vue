<template>
  <div id="app" :class="{ 'sidebar-open': sidebarOpen }">
    <!-- Loading Bar -->
    <div id="global-loading" class="loading-bar">
      <div class="loading-bar-inner"></div>
    </div>

    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <button class="btn-icon" @click="toggleSidebar">
          <i class="fas fa-bars"></i>
        </button>
        <span class="logo">🐱</span>
        <h1 class="title">猫猫侠</h1>
      </div>
      <div class="header-right">
        <button class="btn-icon" @click="toggleTheme" :title="isDark ? '切换亮色' : '切换暗色'">
          {{ isDark ? '☀️' : '🌙' }}
        </button>
        <button class="btn-icon" @click="toggleLocale" :title="currentLocale === 'zh-CN' ? 'Switch to English' : '切换到中文'">
          {{ currentLocale === 'zh-CN' ? '🇺🇸' : '🇨🇳' }}
        </button>
        <span class="mood-emoji">{{ moodEmoji }}</span>
        <span class="stat-badge level">Lv.{{ userStore.level }}</span>
        <span class="stat-badge coins">🪙 {{ userStore.coins }}</span>
        <span class="stat-badge streak">🔥 {{ userStore.streak }}</span>
      </div>
    </header>

    <!-- Main Layout -->
    <div class="main-layout">
      <!-- Sidebar -->
      <nav class="sidebar" :class="{ open: sidebarOpen }">
        <div class="nav-section">
          <NavItem page="dashboard" icon="fas fa-home" :label="t('nav.dashboard')" @click="navigate" />
          <NavItem page="chat" icon="fas fa-comments" :label="t('nav.chat')" @click="navigate" />
          <NavItem page="checkin" icon="fas fa-check-circle" :label="t('nav.checkin')" @click="navigate" />
          <NavItem page="stats" icon="fas fa-chart-bar" :label="t('nav.stats')" @click="navigate" />
          <NavItem page="achievements" icon="fas fa-trophy" :label="t('nav.achievements')" @click="navigate" />
          <NavItem page="profile" icon="fas fa-user" :label="t('nav.profile')" @click="navigate" />
        </div>
        <div class="nav-section">
          <div class="nav-section-title">{{ t('nav.gamefication', '游戏化') }}</div>
          <NavItem page="character" icon="fas fa-user-shield" :label="t('nav.character', '角色面板')" @click="navigate" />
          <NavItem page="shop" icon="fas fa-store" :label="t('nav.shop', '商店')" @click="navigate" />
        </div>
        <div class="nav-section">
          <div class="nav-section-title">{{ t('nav.data', '数据') }}</div>
          <NavItem page="heatmap" icon="fas fa-fire" :label="t('nav.heatmap', '热力图')" @click="navigate" />
          <NavItem page="leaderboard" icon="fas fa-trophy" :label="t('nav.leaderboard', '排行榜')" @click="navigate" />
          <NavItem page="coach" icon="fas fa-lightbulb" :label="t('nav.coach', 'AI教练')" @click="navigate" />
          <NavItem page="settings" icon="fas fa-cog" :label="t('nav.settings', '设置')" @click="navigate" />
        </div>
      </nav>

      <!-- Content -->
      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <!-- Bottom Nav (Mobile) -->
    <nav class="bottom-nav">
      <NavItem page="dashboard" icon="fas fa-home" label="主页" @click="navigate" />
      <NavItem page="tasks" icon="fas fa-tasks" label="任务" @click="navigate" />
      <NavItem page="chat" icon="fas fa-comments" label="猫猫侠" @click="navigate" />
      <NavItem page="character" icon="fas fa-user-shield" label="角色" @click="navigate" />
      <NavItem page="settings" icon="fas fa-cog" label="更多" @click="navigate" />
    </nav>

    <!-- Toast Container -->
    <div id="toast-container" class="toast-container"></div>

    <!-- Modal -->
    <div class="modal-overlay" :class="{ active: modalOpen }" @click="closeModal">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>{{ modalTitle }}</h3>
          <button class="btn-icon" @click="closeModal"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" v-html="modalContent"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useI18n } from 'vue-i18n'
import { setLocale } from '@/i18n'
import NavItem from '@/components/NavItem.vue'

const router = useRouter()
const userStore = useUserStore()
const { locale, t } = useI18n()

// Locale
const currentLocale = computed(() => locale.value)
const toggleLocale = () => {
  const newLocale = locale.value === 'zh-CN' ? 'en' : 'zh-CN'
  setLocale(newLocale)
}

// Sidebar
const sidebarOpen = ref(false)
const toggleSidebar = () => { sidebarOpen.value = !sidebarOpen.value }

// Theme
const isDark = ref(true)
const toggleTheme = () => {
  isDark.value = !isDark.value
  document.documentElement.setAttribute('data-theme', isDark.value ? '' : 'light')
  localStorage.setItem('cat-hero-theme', isDark.value ? 'dark' : 'light')
}

// Mood
const moodEmoji = computed(() => {
  const moods: Record<string, string> = {
    ecstatic: '😻', happy: '😺', neutral: '🐱', sad: '😿', devastated: '🙀'
  }
  return moods[userStore.mood?.mood || 'neutral'] || '🐱'
})

// Navigation
const navigate = (page: string) => {
  router.push({ name: page })
  sidebarOpen.value = false
}

// Modal
const modalOpen = ref(false)
const modalTitle = ref('')
const modalContent = ref('')

const openModal = (title: string, content: string) => {
  modalTitle.value = title
  modalContent.value = content
  modalOpen.value = true
}
const closeModal = () => { modalOpen.value = false }

// Toast
const showToast = (message: string, type: string = 'info') => {
  const container = document.getElementById('toast-container')
  if (!container) return
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = message
  container.appendChild(toast)
  setTimeout(() => toast.remove(), 3000)
}

// Init
onMounted(async () => {
  // Load theme
  const savedTheme = localStorage.getItem('cat-hero-theme')
  if (savedTheme === 'light') {
    isDark.value = false
    document.documentElement.setAttribute('data-theme', 'light')
  }
  
  // Load user data
  await Promise.all([
    userStore.fetchUser(),
    userStore.fetchProfile(),
    userStore.fetchMood()
  ])
})

// Expose for child components
defineExpose({ showToast, openModal, closeModal })
</script>

<style>
/* CSS Variables */
:root {
  --primary: #FF6B9D;
  --primary-dark: #E85D8A;
  --secondary: #4ECDC4;
  --accent: #FFE66D;
  --bg: #0F0F1A;
  --bg-card: #1A1A2E;
  --bg-card-hover: #222240;
  --bg-input: #16213E;
  --text: #E8E8E8;
  --text-dim: #8888AA;
  --success: #4CAF50;
  --warning: #FF9800;
  --danger: #F44336;
  --info: #2196F3;
  --border: #2A2A4A;
  --sidebar-width: 220px;
  --header-height: 60px;
  --bottom-nav-height: 60px;
}

[data-theme="light"] {
  --bg: #F5F5F5;
  --bg-card: #FFFFFF;
  --bg-card-hover: #F0F0F0;
  --bg-input: #E8E8E8;
  --text: #333333;
  --text-dim: #888888;
  --border: #DDDDDD;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif; background: var(--bg); color: var(--text); }

/* Header */
.header {
  position: fixed; top: 0; left: 0; right: 0;
  height: var(--header-height);
  background: rgba(15,15,26,0.95);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px; z-index: 100;
}
.header-left, .header-right { display: flex; align-items: center; gap: 12px; }
.logo { font-size: 28px; }
.title { font-size: 18px; font-weight: 700; color: var(--primary); }
.stat-badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
.stat-badge.level { background: rgba(255,107,157,0.2); color: var(--primary); }
.stat-badge.coins { background: rgba(255,230,109,0.2); color: var(--accent); }
.stat-badge.streak { background: rgba(255,152,0,0.2); color: var(--warning); }
.mood-emoji { font-size: 20px; }

/* Layout */
.main-layout { display: flex; padding-top: var(--header-height); min-height: 100vh; }

/* Sidebar */
.sidebar {
  position: fixed; top: var(--header-height); left: 0; bottom: 0;
  width: var(--sidebar-width);
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  overflow-y: auto; padding: 16px 0; z-index: 90;
  transition: transform 0.3s;
}
.nav-section { padding: 0 8px; margin-bottom: 8px; }
.nav-section-title { padding: 8px 16px; font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; }

/* Content */
.content { flex: 1; margin-left: var(--sidebar-width); padding: 24px; max-width: 1200px; }

/* Bottom Nav */
.bottom-nav {
  display: none;
  position: fixed; bottom: 0; left: 0; right: 0;
  height: var(--bottom-nav-height);
  background: rgba(15,15,26,0.98);
  border-top: 1px solid var(--border);
  z-index: 100;
}

/* Loading Bar */
.loading-bar { position: fixed; top: 0; left: 0; right: 0; height: 3px; z-index: 9999; display: none; }
.loading-bar.active { display: block; }
.loading-bar-inner { height: 100%; background: linear-gradient(90deg, var(--primary), var(--secondary)); animation: loading-slide 1s ease-in-out infinite; width: 30%; }
@keyframes loading-slide { 0% { transform: translateX(-100%); } 50% { transform: translateX(200%); } 100% { transform: translateX(-100%); } }

/* Toast */
.toast-container { position: fixed; top: 80px; right: 20px; z-index: 200; display: flex; flex-direction: column; gap: 8px; }
.toast { padding: 12px 16px; border-radius: 10px; font-size: 14px; animation: slideIn 0.3s; }
.toast-success { background: rgba(76,175,80,0.9); color: white; }
.toast-error { background: rgba(244,67,54,0.9); color: white; }
.toast-info { background: rgba(33,150,243,0.9); color: white; }

/* Modal */
.modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 200; align-items: center; justify-content: center; }
.modal-overlay.active { display: flex; }
.modal { background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border); width: 90%; max-width: 500px; max-height: 80vh; overflow-y: auto; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); }
.modal-body { padding: 20px; }

/* Page Transition */
.page-enter-active, .page-leave-active { transition: opacity 0.2s, transform 0.2s; }
.page-enter-from { opacity: 0; transform: translateY(10px); }
.page-leave-to { opacity: 0; transform: translateY(-10px); }

/* Responsive */
@media (max-width: 768px) {
  .sidebar { transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); }
  .content { margin-left: 0; padding: 16px; padding-bottom: calc(var(--bottom-nav-height) + 16px); }
  .bottom-nav { display: flex; }
  .header-stats { display: none; }
}

@keyframes slideIn { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }

.btn-icon { background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 18px; padding: 8px; border-radius: 50%; transition: all 0.2s; }
.btn-icon:hover { color: var(--primary); background: rgba(255,107,157,0.1); }
</style>
