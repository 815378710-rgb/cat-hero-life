import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import i18n from './i18n'
import App from './App.vue'
import './styles/enhance.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n as any)
app.mount('#app')
