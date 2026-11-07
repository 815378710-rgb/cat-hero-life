<template>
  <div class="settings-page">
    <h2 style="margin-bottom:20px">⚙️ 设置</h2>
    
    <div class="settings-section">
      <h3>🤖 AI大脑配置</h3>
      <p class="text-dim mb-8">接入大模型API，让猫猫侠真正"活"起来</p>
      <div class="input-group"><label>AI提供商</label>
        <select v-model="aiForm.provider" class="input"><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="qwen">通义千问</option><option value="claude">Claude</option></select>
      </div>
      <div class="input-group"><label>API Key</label><input v-model="aiForm.apiKey" type="password" class="input" placeholder="sk-xxx" /></div>
      <div class="input-group"><label>模型（留空使用默认）</label><input v-model="aiForm.model" class="input" placeholder="例如：deepseek-chat" /></div>
      <div style="display:flex;gap:8px"><button class="btn btn-primary" @click="saveAi">保存</button><span class="text-dim" id="ai-status">{{ aiEnabled ? '✅ 已启用' : '❌ 未配置' }}</span></div>
      <div class="text-dim" id="ai-current" style="margin-top:10px;font-size:13px;line-height:1.9">{{ aiSummary || '正在读取当前配置…' }}</div>
    </div>
    
    <div class="settings-section">
      <h3>🐱 AI管家性格</h3>
      <div class="personality-grid">
        <div v-for="p in personalities" :key="p.type" class="personality-card" :class="{ active: currentPersonality === p.type }" @click="setPersonality(p.type)">
          <div class="p-icon">{{ p.icon }}</div>
          <div class="p-name">{{ p.name }}</div>
          <div class="p-desc">{{ p.desc }}</div>
        </div>
      </div>
    </div>
    
    <div class="settings-section">
      <h3>👤 用户信息</h3>
      <div class="input-group"><label>昵称</label><input v-model="username" class="input" /></div>
      <button class="btn btn-primary" @click="saveUsername">保存</button>
    </div>
    
    <div class="settings-section">
      <h3>💰 财务设置</h3>
      <div class="grid-2">
        <div class="input-group"><label>月收入</label><input v-model.number="finForm.income" type="number" class="input" /></div>
        <div class="input-group"><label>月预算</label><input v-model.number="finForm.budget" type="number" class="input" /></div>
      </div>
      <button class="btn btn-primary" @click="saveFin">保存</button>
    </div>

    <div class="settings-section">
      <h3>💬 微信集成</h3>
      <p class="text-dim mb-8" v-if="wechatStatus">微信已绑定：{{ wechatStatus.wxid || '未知' }} {{ wechatStatus.bound ? '✅ 在线' : '❌ 离线' }}</p>
      <p class="text-dim mb-8" v-else>未绑定微信，绑定后可通过微信与猫猫侠交互</p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" @click="bindWechat" :disabled="wechatStatus?.bound">📱 绑定微信</button>
        <button class="btn" @click="unbindWechat" :disabled="!wechatStatus?.bound">解除绑定</button>
      </div>
    </div>

    <div class="settings-section">
      <h3>🌈 深度数据面板</h3>
      <p class="text-dim mb-8">查看健康/财务/学习/社交的详细分析</p>
      <div class="action-grid-3">
        <button class="btn" @click="openDeepPanel('health')">❤️ 健康</button>
        <button class="btn" @click="openDeepPanel('finance')">💰 财务</button>
        <button class="btn" @click="openDeepPanel('learning')">📚 学习</button>
        <button class="btn" @click="openDeepPanel('social')">🤝 社交</button>
        <button class="btn" @click="openDeepPanel('annual')">📅 年度</button>
        <button class="btn" @click="openDeepPanel('export')">📥 导出</button>
      </div>
    </div>

    <div class="settings-section">
      <h3>🛠️ 系统管理</h3>
      <div class="input-group"><label>管理令牌（备份/导入/AI配置需要）</label><input v-model="adminToken" class="input" placeholder="见 NAS data/admin_token.txt 或环境变量" @change="saveAdminToken" /></div>
      <div class="grid-2">
        <div class="sys-card" @click="checkHealth">
          <div class="sys-icon">💓</div>
          <div class="sys-label">健康检查</div>
          <div class="sys-value" :class="healthOk ? 'ok' : 'err'">{{ healthOk ? '✅ 正常' : '❌ 异常' }}</div>
        </div>
        <div class="sys-card" @click="showMetrics">
          <div class="sys-icon">📊</div>
          <div class="sys-label">系统指标</div>
          <div class="sys-value text-dim" v-if="metrics">{{ metrics.uptime || '-' }}</div>
        </div>
        <div class="sys-card" @click="downloadBackup">
          <div class="sys-icon">💾</div>
          <div class="sys-label">数据备份</div>
          <div class="sys-value text-dim">下载JSON</div>
        </div>
        <div class="sys-card" @click="syncFinanceNow">
          <div class="sys-icon">🔄</div>
          <div class="sys-label">同步记账</div>
          <div class="sys-value text-dim">{{ financeCount || '点击同步' }}</div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>🗑️ 数据管理</h3>
      <div class="grid-2">
        <div class="sys-card" @click="clearChat">
          <div class="sys-icon">💬</div>
          <div class="sys-label">清空聊天记录</div>
        </div>
        <div class="sys-card" @click="importData">
          <div class="sys-icon">📥</div>
          <div class="sys-label">导入备份数据</div>
          <input type="file" ref="fileInput" @change="handleImport" style="display:none" />
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h3>🧠 神经智能调试</h3>
      <p class="text-dim mb-8">测试神经智能系统各接口（仅用于调试）</p>
      <div class="neural-grid">
        <button class="neural-btn" @click="testNeuralEndpoint('getEnergy', () => neuralApi.getEnergy())">getEnergy</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getBalance', () => neuralApi.getBalance())">getBalance</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getMatrix', () => neuralApi.getMatrix())">getMatrix</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getCycles', () => neuralApi.getCycles())">getCycles</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getEnergyCurve', () => neuralApi.getEnergyCurve())">getEnergyCurve</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getCatForm', () => neuralApi.getCatForm())">getCatForm</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getTitles', () => neuralApi.getTitles())">getTitles</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getSocialGraph', () => neuralApi.getSocialGraph())">getSocialGraph</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getSocialInsights', () => neuralApi.getSocialInsights())">getSocialInsights</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getMemoryStats', () => neuralApi.getMemoryStats())">getMemoryStats</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getDecisions', () => neuralApi.getDecisions())">getDecisions</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getPersonality', () => neuralApi.getPersonality())">getPersonality</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getStacks', () => neuralApi.getStacks())">getStacks</button>
        <button class="neural-btn" @click="testNeuralEndpoint('propagate', () => neuralApi.propagate('health', 1))">propagate</button>
        <button class="neural-btn" @click="testNeuralEndpoint('learnWeights', () => neuralApi.learnWeights())">learnWeights</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getPropagationHistory', () => neuralApi.getPropagationHistory())">getPropagationHistory</button>
        <button class="neural-btn" @click="testNeuralEndpoint('learnEnergy', () => neuralApi.learnEnergy())">learnEnergy</button>
        <button class="neural-btn" @click="testNeuralEndpoint('recordDecision', () => neuralApi.recordDecision('test', 'health'))">recordDecision</button>
        <button class="neural-btn" @click="testNeuralEndpoint('checkDecisions', () => neuralApi.checkDecisions())">checkDecisions</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getBalanceTrend', () => neuralApi.getBalanceTrend())">getBalanceTrend</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getAnchors', () => neuralApi.getAnchors())">getAnchors</button>
        <button class="neural-btn" @click="testNeuralEndpoint('suggestStack', () => neuralApi.suggestStack('test'))">suggestStack</button>
        <button class="neural-btn" @click="testNeuralEndpoint('createStack', () => neuralApi.createStack('new', 'anchor'))">createStack</button>
        <button class="neural-btn" @click="testNeuralEndpoint('selectStyle', () => neuralApi.selectStyle('happy', 'chat', 'high'))">selectStyle</button>
        <button class="neural-btn" @click="testNeuralEndpoint('addPerson', () => neuralApi.addPerson('test', 'friend'))">addPerson</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getMemoryContext', () => neuralApi.getMemoryContext())">getMemoryContext</button>
        <button class="neural-btn" @click="testNeuralEndpoint('searchMemory', () => neuralApi.searchMemory('test'))">searchMemory</button>
        <button class="neural-btn" @click="testNeuralEndpoint('consolidateMemory', () => neuralApi.consolidateMemory())">consolidateMemory</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getQuests', () => neuralApi.getQuests())">getQuests</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getNotificationStats', () => neuralApi.getNotificationStats())">getNotificationStats</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getBestTimes', () => neuralApi.getBestTimes())">getBestTimes</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getConflicts', () => neuralApi.getConflicts())">getConflicts</button>
        <button class="neural-btn" @click="testNeuralEndpoint('verifyData', () => neuralApi.verifyData('test'))">verifyData</button>
        <button class="neural-btn" @click="testNeuralEndpoint('getLifecycle', () => neuralApi.getLifecycle())">getLifecycle</button>
        <button class="neural-btn" @click="testNeuralEndpoint('init', () => neuralApi.init())">init</button>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { aiConfigApi, neuralApi } from '@/api'
import { useToast } from '@/composables/useToast'
const userStore = useUserStore()
const aiForm = ref({ provider: 'deepseek', apiKey: '', model: '' })
const aiEnabled = ref(false)
const aiSummary = ref('')
const username = ref('')
const finForm = ref({ income: 0, budget: 0 })
const currentPersonality = ref('encouraging')
const wechatStatus = ref<any>(null)
const healthOk = ref(false)
const metrics = ref<any>(null)
const financeCount = ref('')
const fileInput = ref<HTMLInputElement>()
const adminToken = ref(localStorage.getItem('catHeroAdminToken') || '')
const saveAdminToken = () => localStorage.setItem('catHeroAdminToken', adminToken.value.trim())
const toast = useToast()

async function testNeuralEndpoint(name: string, apiCall: () => Promise<any>) {
  toast.info(`调用 ${name}...`)
  try {
    const res = await apiCall()
    toast.success(`${name}: OK`)
  } catch(e: any) {
    toast.error(`${name}: ${e.message}`)
  }
}
const personalities = [
  { type: 'encouraging', icon: '🥰', name: '温柔鼓励型', desc: '温暖、支持、肯定' },
  { type: 'strict', icon: '😤', name: '严厉教练型', desc: '直接、严肃、Push' },
  { type: 'funny', icon: '😈', name: '毒舌损友型', desc: '吐槽、调侃、激将' },
]

onMounted(async () => {
  try {
    const cfg = await aiConfigApi.getConfig()
    applyAiConfig(cfg)
    username.value = userStore.username
    currentPersonality.value = userStore.user?.personality_type || 'encouraging'
    
    const w = await fetch('/api/wechat-bot/status').catch(() => {})
    if (w) wechatStatus.value = await w.json()
    
    const h = await fetch('/api/system/health').catch(() => {})
    if (h) { const dh = await h.json(); healthOk.value = dh.status === 'ok' }
    
    const f = await fetch('/api/finance/summary').catch(() => {})
    if (f) { const df = await f.json(); financeCount.value = df.stats?.total_records + '条' || '' }
  } catch(e) {}
})

const applyAiConfig = (cfg: any) => {
  if (!cfg?.config) return
  aiForm.value.provider = cfg.config.provider || aiForm.value.provider
  aiForm.value.model = cfg.config.model || aiForm.value.model
  aiSummary.value =
    `当前配置：提供商 ${cfg.config.provider || '-'}` +
    ` ｜ 实际模型 ${cfg.config.actualModel || cfg.config.model || '-'}` +
    (cfg.config.modelLocked ? '（代码锁定）' : '') +
    ` ｜ API Key ${cfg.config.apiKeyMasked || '未配置'}` +
    ` ｜ 来源 ${cfg.config.apiKeySource === 'database' ? '数据库' : cfg.config.apiKeySource === 'env' ? '环境变量' : '无'}` +
    (cfg.config.updatedAt ? ` ｜ 最后更新 ${cfg.config.updatedAt}` : '')
  aiEnabled.value = !!cfg.enabled
}

const saveAi = async () => {
  await aiConfigApi.updateConfig(aiForm.value)
  aiForm.value.apiKey = ''   // 保存后清空输入框（Key 留空=沿用旧值，不会清掉）
  toast.success('AI配置已保存')
  applyAiConfig(await aiConfigApi.getConfig())
}
const setPersonality = async (type: string) => {
  await fetch('/api/chat/personality', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type }) })
  currentPersonality.value = type
}
const saveUsername = async () => { await userStore.updateProfile({ username: username.value } as any); alert('昵称已保存') }
const saveFin = async () => { await userStore.updateProfile({ monthly_income: finForm.value.income, monthly_budget: finForm.value.budget } as any); alert('财务设置已保存') }

const bindWechat = async () => {
  const wxid = prompt('输入微信ID（wxid_xxx）')
  if (wxid) {
    await fetch('/api/wechat-bot/bind', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wxid }) })
    alert('绑定成功')
    location.reload()
  }
}
const unbindWechat = async () => {
  await fetch('/api/wechat-bot/unbind', { method: 'POST' })
  alert('已解绑')
  location.reload()
}

const openDeepPanel = async (type: string) => {
  if (type === 'export') { window.open('/api/deep/privacy/export', '_blank'); return }
  if (type === 'annual') { window.open('/api/deep/annual-report', '_blank'); return }
  try {
    const r = await fetch(`/api/deep/${type}/dashboard`)
    const d = await r.json()
    alert(JSON.stringify(d, null, 2).slice(0, 500))
  } catch(e) { alert('暂无数据') }
}

const checkHealth = async () => {
  const r = await fetch('/api/system/health')
  const d = await r.json()
  healthOk.value = d.status === 'ok'
  alert(d.status === 'ok' ? '系统正常运行 ✅' : '系统异常 ❌')
}
const showMetrics = async () => {
  const r = await fetch('/api/system/metrics')
  metrics.value = await r.json()
  alert(JSON.stringify(metrics.value, null, 2).slice(0, 500))
}
const downloadBackup = () => window.open('/api/backup?adminToken=' + encodeURIComponent(adminToken.value.trim()), '_blank')
const syncFinanceNow = async () => {
  const r = await fetch('/api/finance/sync')
  const d = await r.json()
  financeCount.value = d.synced + '条'
  alert(`同步了${d.synced}条记录`)
}
const clearChat = async () => {
  if (confirm('确认清空所有聊天记录？')) {
    await fetch('/api/chat/history', { method: 'DELETE' })
    alert('已清空')
  }
}
const importData = () => fileInput.value?.click()
const handleImport = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const form = new FormData()
  form.append('data', file)
  const headers: Record<string, string> = {}
  if (adminToken.value.trim()) headers['x-admin-token'] = adminToken.value.trim()
  const res = await fetch('/api/deep/import', { method: 'POST', body: form, headers })
  if (!res.ok) { alert('导入失败：' + (await res.json().then(d => d.error).catch(() => res.status))); return }
  alert('导入成功')
  location.reload()
}
</script>
<style scoped>
.settings-page { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.settings-section { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 16px; }
.settings-section h3 { font-size: 16px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.text-dim { color: var(--text-dim); font-size: 13px; }
.mb-8 { margin-bottom: 8px; }
.input-group { margin-bottom: 16px; }
.input-group label { display: block; font-size: 12px; color: var(--text-dim); margin-bottom: 6px; }
.input { width: 100%; padding: 10px 14px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 14px; outline: none; }
.input:focus { border-color: var(--primary); }
.personality-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.personality-card { padding: 16px; background: var(--bg-input); border: 2px solid var(--border); border-radius: 12px; cursor: pointer; text-align: center; transition: all 0.2s; }
.personality-card.active { border-color: var(--primary); background: rgba(255,107,157,0.1); }
.personality-card:hover { border-color: var(--primary); }
.p-icon { font-size: 32px; margin-bottom: 8px; }
.p-name { font-size: 14px; font-weight: 600; }
.p-desc { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.action-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.sys-card { padding: 16px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 10px; cursor: pointer; text-align: center; transition: all 0.2s; }
.sys-card:hover { border-color: var(--primary); }
.sys-icon { font-size: 28px; margin-bottom: 8px; }
.sys-label { font-size: 13px; color: var(--text-dim); margin-bottom: 4px; }
.sys-value { font-size: 14px; font-weight: 600; }
.sys-value.ok { color: #4CAF50; }
.sys-value.err { color: #F44336; }
.btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--primary); color: white; }
.neural-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; }
.neural-btn { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-input); color: var(--text); cursor: pointer; font-size: 12px; font-family: monospace; transition: all 0.2s; }
.neural-btn:hover { border-color: var(--primary); color: var(--primary); }
@media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } .action-grid-3 { grid-template-columns: repeat(2, 1fr); } }
</style>
