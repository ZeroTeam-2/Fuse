<template>
  <div class="card-detail">
    <div v-if="loading" class="state-text">Загрузка…</div>

    <template v-else-if="card">
      <div class="top-bar">
        <NuxtLink to="/" class="back-link">← Маркетплейс</NuxtLink>
      </div>

      <div class="header-card">
        <div class="header-left">
          <div class="header-cover">
            <img v-if="card.coverUrl" :src="card.coverUrl" :alt="card.title" class="cover-img" />
            <div v-else class="cover-placeholder">{{ card.title[0] }}</div>
          </div>
          <div class="header-info">
            <div class="header-badges">
              <span v-if="card.category" class="cat-badge">{{ card.category }}</span>
              <span v-if="card.subcategory" class="sub-badge">{{ card.subcategory }}</span>
            </div>
            <h1 class="card-title">{{ card.title }}</h1>
            <p v-if="card.tagline" class="card-tagline">{{ card.tagline }}</p>
          </div>
        </div>
        <div class="header-actions">
          <NuxtLink :to="`/cards/${card.id}/run`" class="run-btn">Запустить</NuxtLink>
          <NuxtLink :to="`/cards/${card.id}/playground`" class="playground-btn">Playground</NuxtLink>
        </div>
      </div>

      <div class="metrics-row">
        <div class="metric">
          <span class="metric-value">{{ card.runCount }}</span>
          <span class="metric-label">запусков</span>
        </div>
        <div class="metric">
          <span class="metric-value">{{ card.providers.length }}</span>
          <span class="metric-label">сервисов</span>
        </div>
        <div class="metric">
          <span class="metric-value">{{ card.endpointCount }}</span>
          <span class="metric-label">endpoints</span>
        </div>
        <div class="metric">
          <span class="metric-value">{{ card.stepCount }}</span>
          <span class="metric-label">шагов</span>
        </div>
      </div>

      <div class="tabs">
        <button
          :class="['tab', { active: activeTab === 'overview' }]"
          @click="activeTab = 'overview'"
        >
          Обзор
        </button>
        <button
          :class="['tab', { active: activeTab === 'services' }]"
          @click="activeTab = 'services'"
        >
          Сервисы и endpoints
        </button>
      </div>

      <div v-if="activeTab === 'overview'" class="overview-tab">
        <div v-if="card.description" class="description-block">
          <p v-for="(para, i) in descriptionParagraphs" :key="i" class="description-para">{{ para }}</p>
        </div>
        <div v-else class="state-text">Описание отсутствует</div>
      </div>

      <div v-if="activeTab === 'services'" class="services-tab">
        <div v-if="card.providersDetail.length === 0" class="state-text">
          Нет подключённых сервисов
        </div>
        <div v-for="provider in card.providersDetail" :key="provider.appId" class="provider-block">
          <h3 class="provider-name">{{ provider.name }}</h3>
          <div class="endpoint-list">
            <div v-for="ep in provider.endpoints" :key="ep.id" class="endpoint-row">
              <span :class="['method-badge', methodClass(ep.method)]">{{ ep.method }}</span>
              <code class="endpoint-path">{{ ep.path }}</code>
              <span v-if="ep.summary" class="endpoint-summary">{{ ep.summary }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="state-text">Сценарий не найден</div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const { $api } = useNuxtApp() as any;

interface ProviderDetail {
  appId: string;
  name: string;
  endpoints: { id: string; method: string; path: string; summary?: string }[];
}

interface CardDetail {
  id: string;
  title: string;
  tagline: string;
  coverUrl?: string;
  category?: string;
  subcategory?: string;
  runCount: number;
  providers: string[];
  endpointCount: number;
  stepCount: number;
  description?: string;
  providersDetail: ProviderDetail[];
}

const card = ref<CardDetail | null>(null);
const loading = ref(true);
const activeTab = ref<"overview" | "services">("overview");

const descriptionParagraphs = computed(() => {
  if (!card.value?.description) return [];
  return card.value.description.split("\n").filter((p) => p.trim());
});

function methodClass(method: string): string {
  const map: Record<string, string> = {
    GET: "m-get",
    POST: "m-post",
    PUT: "m-put",
    DELETE: "m-delete",
    PATCH: "m-patch",
  };
  return map[method] ?? "m-get";
}

async function fetchCard() {
  loading.value = true;
  try {
    const { data } = await $api.GET(`/api/marketplace/${route.params.id}`, {});
    if (data.value) {
      card.value = data.value;
    }
  } catch {
    card.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(fetchCard);
</script>

<style scoped>
.card-detail { max-width: 960px; margin: 0 auto; padding: 24px 24px 48px; display: flex; flex-direction: column; gap: 24px; }
.top-bar { display: flex; }
.back-link { font-size: 14px; color: #6366f1; text-decoration: none; font-weight: 500; }
.back-link:hover { text-decoration: underline; }
.state-text { font-size: 15px; color: #71717a; text-align: center; padding: 48px 0; }
.header-card { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; padding: 24px; }
.header-left { display: flex; gap: 20px; }
.header-cover { width: 80px; height: 80px; border-radius: 14px; overflow: hidden; background: #f4f4f5; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.cover-img { width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder { font-size: 32px; font-weight: 800; color: #d4d4d8; text-transform: uppercase; }
.header-info { display: flex; flex-direction: column; gap: 8px; }
.header-badges { display: flex; gap: 6px; }
.cat-badge { font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 100px; background: #eef2ff; color: #6366f1; }
.sub-badge { font-size: 12px; font-weight: 500; padding: 3px 10px; border-radius: 100px; background: #f4f4f5; color: #71717a; }
.card-title { font-size: 24px; font-weight: 800; color: #18181b; margin: 0; letter-spacing: -0.02em; }
.card-tagline { font-size: 15px; color: #71717a; margin: 0; }
.header-actions { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
.run-btn { padding: 10px 20px; border-radius: 10px; border: none; background: #6366f1; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; text-decoration: none; display: inline-block; text-align: center; }
.run-btn:hover { background: #4f46e5; }
.playground-btn { padding: 10px 20px; border-radius: 10px; border: 1px solid #e4e4e7; background: #fff; color: #18181b; font-size: 14px; font-weight: 500; cursor: pointer; white-space: nowrap; text-decoration: none; display: inline-block; text-align: center; }
.playground-btn:hover { background: #f4f4f5; }
.metrics-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.metric { background: #fff; border: 1px solid #e4e4e7; border-radius: 10px; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.metric-value { font-size: 24px; font-weight: 800; color: #18181b; }
.metric-label { font-size: 13px; color: #71717a; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid #e4e4e7; }
.tab { padding: 10px 16px; border: none; background: none; font-size: 14px; font-weight: 500; color: #71717a; cursor: pointer; border-bottom: 2px solid transparent; }
.tab.active { color: #18181b; border-bottom-color: #6366f1; }
.overview-tab { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 24px; }
.description-block { display: flex; flex-direction: column; gap: 12px; }
.description-para { font-size: 15px; color: #3f3f46; line-height: 1.7; margin: 0; }
.services-tab { display: flex; flex-direction: column; gap: 16px; }
.provider-block { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.provider-name { font-size: 16px; font-weight: 700; color: #18181b; margin: 0; }
.endpoint-list { display: flex; flex-direction: column; }
.endpoint-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f4f4f5; }
.endpoint-row:last-child { border-bottom: none; }
.method-badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; min-width: 56px; text-align: center; }
.m-get { background: #dcfce7; color: #16a34a; }
.m-post { background: #fee2e2; color: #e11d48; }
.m-put { background: #ffedd5; color: #ea580c; }
.m-delete { background: #fee2e2; color: #e11d48; }
.m-patch { background: #eef2ff; color: #6366f1; }
.endpoint-path { font-size: 14px; font-weight: 600; color: #18181b; font-family: monospace; }
.endpoint-summary { font-size: 13px; color: #a1a1aa; margin-left: auto; }
</style>
