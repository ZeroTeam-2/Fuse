<template>
  <div class="detail-page">
    <div v-if="loading" class="state-text">Загрузка…</div>

    <template v-else-if="app">
      <div class="top-bar">
        <NuxtLink to="/my/apps" class="back-link">← Все приложения</NuxtLink>
      </div>

      <div class="meta-card">
        <div class="meta-header">
          <div class="meta-left">
            <h1 class="app-title">{{ app.name }}</h1>
            <div class="meta-chips">
              <span :class="['badge', app.published ? 'badge-on' : 'badge-off']">
                {{ app.published ? "Опубликован" : "Скрыт" }}
              </span>
              <span class="chip">{{ app.endpoints?.length ?? 0 }} endpoints</span>
              <span class="chip">{{ app.scenarioCount ?? 0 }} сценариев</span>
            </div>
          </div>
          <div class="meta-actions">
            <NuxtLink :to="`/my/apps/${route.params.id}/update`" class="action-btn sync-btn">
              Синхронизировать
            </NuxtLink>
            <button class="action-btn toggle-btn" @click="togglePublish">
              {{ app.published ? "Снять с публикации" : "Опубликовать" }}
            </button>
            <button class="action-btn delete-btn" @click="deleteApp">
              Удалить
            </button>
          </div>
        </div>

        <p v-if="app.description" class="app-desc">{{ app.description }}</p>

        <div class="meta-grid">
          <div class="meta-item">
            <span class="meta-label">Хост</span>
            <span class="meta-value">{{ app.host || "—" }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Версия API</span>
            <span class="meta-value">{{ app.apiVersion || "—" }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Синхронизирован</span>
            <span class="meta-value">{{ formatDate(app.syncedAt) }}</span>
          </div>
        </div>
      </div>

      <div class="endpoints-card">
        <h2 class="section-title">Endpoints</h2>
        <div class="endpoint-list">
          <div
            v-for="ep in app.endpoints"
            :key="ep.id"
            class="endpoint-row"
          >
            <span :class="['method-badge', methodClass(ep.method)]">
              {{ ep.method }}
            </span>
            <span class="endpoint-path">{{ ep.path }}</span>
            <span v-if="ep.summary" class="endpoint-summary">{{ ep.summary }}</span>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="state-text">Приложение не найдено</div>
  </div>
</template>

<script setup lang="ts">
import type { App } from "@fuse/shared";

const route = useRoute();
const appId = route.params.id as string;

const app = ref<App | null>(null);
const loading = ref(true);

async function fetchApp() {
  loading.value = true;
  const { $api } = useNuxtApp() as any;
  try {
    const { data } = await $api.GET("/api/apps/{id}", {
      params: { path: { id: appId } },
    });
    app.value = data ?? null;
  } catch {
    app.value = null;
  } finally {
    loading.value = false;
  }
}

async function togglePublish() {
  if (!app.value) return;
  const { $api } = useNuxtApp() as any;
  try {
    await $api.PATCH("/api/apps/{id}/publish", {
      params: { path: { id: appId } },
      body: { published: !app.value.published },
    });
    app.value.published = !app.value.published;
  } catch {
    // error
  }
}

async function deleteApp() {
  const { $api } = useNuxtApp() as any;
  try {
    await $api.DELETE("/api/apps/{id}", {
      params: { path: { id: appId } },
    });
    await navigateTo("/my/apps");
  } catch {
    // error
  }
}

function methodClass(method: string): string {
  const map: Record<string, string> = {
    GET: "m-get",
    POST: "m-post",
    PUT: "m-put",
    DELETE: "m-delete",
  };
  return map[method] ?? "m-get";
}

function formatDate(date?: string): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

onMounted(fetchApp);
</script>

<style scoped>
.detail-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.top-bar {
  display: flex;
}

.back-link {
  font-size: 14px;
  color: #6366f1;
  text-decoration: none;
  font-weight: 500;
}

.back-link:hover {
  text-decoration: underline;
}

.state-text {
  font-size: 15px;
  color: #71717a;
  text-align: center;
  padding: 64px 0;
}

.meta-card {
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.meta-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.meta-left {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.app-title {
  font-size: 22px;
  font-weight: 800;
  color: #18181b;
  margin: 0;
}

.meta-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.badge {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 100px;
}

.badge-on {
  background: #dcfce7;
  color: #16a34a;
}

.badge-off {
  background: #f4f4f5;
  color: #71717a;
}

.chip {
  font-size: 12px;
  color: #52525b;
  background: #f4f4f5;
  padding: 3px 10px;
  border-radius: 6px;
}

.meta-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid #e4e4e7;
  transition: background 0.15s;
  text-decoration: none;
}

.sync-btn {
  background: #6366f1;
  color: #fff;
  border-color: #6366f1;
}

.sync-btn:hover {
  background: #4f46e5;
}

.toggle-btn {
  background: #fff;
  color: #52525b;
}

.toggle-btn:hover {
  background: #f4f4f5;
}

.delete-btn {
  background: #fff;
  color: #e11d48;
  border-color: #fecaca;
}

.delete-btn:hover {
  background: #fef2f2;
}

.app-desc {
  font-size: 15px;
  color: #52525b;
  margin: 0;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid #f4f4f5;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-label {
  font-size: 12px;
  color: #71717a;
  font-weight: 500;
}

.meta-value {
  font-size: 14px;
  color: #18181b;
}

.endpoints-card {
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #18181b;
  margin: 0;
}

.endpoint-list {
  display: flex;
  flex-direction: column;
}

.endpoint-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f4f4f5;
}

.endpoint-row:last-child {
  border-bottom: none;
}

.method-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  min-width: 56px;
  text-align: center;
}

.m-get {
  background: #dcfce7;
  color: #16a34a;
}

.m-post {
  background: #fee2e2;
  color: #e11d48;
}

.m-put {
  background: #ffedd5;
  color: #ea580c;
}

.m-delete {
  background: #fee2e2;
  color: #e11d48;
}

.endpoint-path {
  font-size: 14px;
  font-weight: 600;
  color: #18181b;
  font-family: monospace;
}

.endpoint-summary {
  font-size: 13px;
  color: #a1a1aa;
  margin-left: auto;
  text-align: right;
}
</style>
