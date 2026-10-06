import { defineConfig } from 'vitepress'

const repository = 'https://github.com/matergreen/dbmw'
const base = process.env.DOCS_BASE || '/'

const zhNav = [
  { text: '指南', link: '/guide/' },
  { text: '功能', link: '/features/' },
  { text: 'API', link: '/api/' },
  { text: '参与贡献', link: '/contributing/' },
  { text: 'v1.0.0', items: [{ text: 'GitHub Releases', link: `${repository}/releases` }] },
]

const enNav = [
  { text: 'Guide', link: '/en/guide/' },
  { text: 'Features', link: '/en/features/' },
  { text: 'API', link: '/en/api/' },
  { text: 'Contribute', link: '/en/contributing/' },
  { text: 'v1.0.0', items: [{ text: 'GitHub Releases', link: `${repository}/releases` }] },
]

const zhSidebar = [
  {
    text: '开始使用',
    items: [
      { text: '概览', link: '/guide/' },
      { text: '下载、编译与配置', link: '/guide/getting-started' },
      { text: '查询与事务', link: '/guide/core-usage' },
      { text: '批量、流式与游标', link: '/guide/data-processing' },
      { text: '异步执行', link: '/guide/async' },
      { text: '生产使用必读', link: '/guide/production-notes' },
    ],
  },
  {
    text: '深入了解',
    items: [
      { text: '中间件能力', link: '/features/' },
      { text: '扩展新驱动', link: '/extensions/' },
    ],
  },
  {
    text: 'API 参考',
    items: [
      { text: 'API 总览', link: '/api/' },
      { text: 'Client 与运行时观测', link: '/api/sync' },
      { text: 'Session 与游标', link: '/api/session' },
      { text: 'Future 异步 API', link: '/api/async' },
      { text: '实体映射', link: '/api/mapping' },
      { text: '类型与错误', link: '/api/types' },
      { text: '配置参考', link: '/api/configuration' },
      { text: 'SQL Builder 与工具', link: '/api/sql-tools' },
    ],
  },
  {
    text: '参与项目',
    items: [{ text: '反馈与 Pull Request', link: '/contributing/' }],
  },
]

const enSidebar = [
  {
    text: 'Getting started',
    items: [
      { text: 'Overview', link: '/en/guide/' },
      { text: 'Download, build, configure', link: '/en/guide/getting-started' },
      { text: 'Queries and transactions', link: '/en/guide/core-usage' },
      { text: 'Batch, streaming, cursors', link: '/en/guide/data-processing' },
      { text: 'Async execution', link: '/en/guide/async' },
      { text: 'Production notes', link: '/en/guide/production-notes' },
    ],
  },
  {
    text: 'In depth',
    items: [
      { text: 'Middleware features', link: '/en/features/' },
      { text: 'Extend a driver', link: '/en/extensions/' },
    ],
  },
  {
    text: 'API reference',
    items: [
      { text: 'API overview', link: '/en/api/' },
      { text: 'Client and telemetry', link: '/en/api/sync' },
      { text: 'Session and cursor', link: '/en/api/session' },
      { text: 'Future async API', link: '/en/api/async' },
      { text: 'Entity mapping', link: '/en/api/mapping' },
      { text: 'Types and errors', link: '/en/api/types' },
      { text: 'Configuration reference', link: '/en/api/configuration' },
      { text: 'SQL Builder and utilities', link: '/en/api/sql-tools' },
    ],
  },
  {
    text: 'Project',
    items: [{ text: 'Feedback and pull requests', link: '/en/contributing/' }],
  },
]

export default defineConfig({
  title: 'SQLConduit',
  description: '面向 C++ 服务的数据库连接中间件',
  base,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: { hostname: 'https://matergreen.github.io/' },
  head: [
    ['link', { rel: 'icon', href: `${base}favicon.svg`, type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#0f172a' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'SQLConduit · C++ Database Middleware' }],
  ],
  locales: {
    root: { label: '简体中文', lang: 'zh-CN' },
    en: { label: 'English', lang: 'en-US', link: '/en/' },
  },
  markdown: {
    lineNumbers: true,
    theme: { light: 'github-light', dark: 'github-dark' },
  },
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'SQLConduit',
    nav: zhNav,
    sidebar: {
      '/guide/': zhSidebar,
      '/features/': zhSidebar,
      '/api/': zhSidebar,
      '/extensions/': zhSidebar,
      '/contributing/': zhSidebar,
    },
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdated: { text: '最后更新于' },
    darkModeSwitchLabel: '外观',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '返回顶部',
    locales: {
      en: {
        nav: enNav,
        sidebar: { '/en/': enSidebar },
        outline: { level: [2, 3], label: 'On this page' },
        docFooter: { prev: 'Previous page', next: 'Next page' },
        lastUpdated: { text: 'Last updated' },
        darkModeSwitchLabel: 'Appearance',
        sidebarMenuLabel: 'Menu',
        returnToTopLabel: 'Return to top',
      },
    },
    socialLinks: [
      { icon: 'github', link: repository },
    ],
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
          modal: {
            noResultsText: '没有找到相关结果',
            resetButtonTitle: '清除查询',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
          },
        },
      },
    },
    footer: {
      message: 'Released under the Apache License 2.0.',
      copyright: 'Copyright © SQLConduit contributors',
    },
  },
})
