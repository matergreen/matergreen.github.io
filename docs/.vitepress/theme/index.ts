import DefaultTheme from 'vitepress/theme'
import HomeExtras from './components/HomeExtras.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('HomeExtras', HomeExtras)
  },
}
