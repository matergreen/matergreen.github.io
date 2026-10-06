<script setup lang="ts">
defineProps<{ lang?: 'zh' | 'en' }>()
</script>

<template>
  <section class="home-extra" aria-labelledby="flow-title">
    <div class="section-heading">
      <p class="eyebrow">{{ lang === 'en' ? 'ONE ACCESS LAYER' : '一套访问层' }}</p>
      <h2 id="flow-title">
        {{ lang === 'en' ? 'Keep database concerns out of business code' : '让数据库治理退出业务代码' }}
      </h2>
      <p>
        {{ lang === 'en'
          ? 'Queries pass through governance, routing, pooling, and native drivers in a predictable pipeline.'
          : '查询以清晰、可观测的顺序经过治理、路由、连接池和原生驱动。' }}
      </p>
    </div>

    <div class="pipeline" role="list" :aria-label="lang === 'en' ? 'SQLConduit request pipeline' : 'SQLConduit 请求链路'">
      <div class="pipeline-step" role="listitem"><span>01</span><strong>Client API</strong><small>query · batch · cursor · transaction</small></div>
      <div class="pipeline-step" role="listitem"><span>02</span><strong>{{ lang === 'en' ? 'Govern' : '治理' }}</strong><small>audit · rate limit · cache</small></div>
      <div class="pipeline-step" role="listitem"><span>03</span><strong>{{ lang === 'en' ? 'Route' : '路由' }}</strong><small>retry · circuit · failover</small></div>
      <div class="pipeline-step" role="listitem"><span>04</span><strong>{{ lang === 'en' ? 'Connect' : '连接' }}</strong><small>pool · prepare · heartbeat</small></div>
      <div class="pipeline-step" role="listitem"><span>05</span><strong>{{ lang === 'en' ? 'Drivers' : '驱动' }}</strong><small>MySQL · PostgreSQL · ODBC</small></div>
    </div>

    <div class="driver-strip" aria-label="Supported databases">
      <span>MySQL</span><span>PostgreSQL</span><span>Oracle OCI</span><span>ODBC / SQL Server</span>
    </div>
  </section>
</template>
