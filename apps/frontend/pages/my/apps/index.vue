<template>
  <div class="apps-page">
    <div class="page-header">
      <h1 class="page-title">Мои API</h1>
      <NuxtLink to="/my/apps/new" class="new-btn">Новое приложение</NuxtLink>
    </div>

    <div v-if="loading" class="state-text">Загрузка…</div>

    <div v-else-if="apps.length === 0" class="empty-state">
      <p class="empty-text">У вас пока нет приложений</p>
      <NuxtLink to="/my/apps/new" class="new-btn">Создать первое</NuxtLink>
    </div>

    <template v-else>
      <div class="apps-grid">
        <NuxtLink
          v-for="app in apps"
          :key="app.id"
          :to="`/my/apps/${app.id}`"
          class="app-card"
        >
          <div class="card-header">
            <span class="card-name">{{ app.name }}</span>
            <span :class="['badge', app.published ? 'badge-on' : 'badge-off']">
              {{ app.published ? "Опубликован" : "Скрыт" }}
            </span>
          </div>
          <p v-if="app.description" class="card-desc">{{ app.description }}</p>
          <div class="card-meta">
            <span v-if="app.host" class="meta-chip">{{ app.host }}</span>
            <span v-if="app.apiVersion" class="meta-chip">v{{ app.apiVersion }}</span>
          </div>
          <div class="card-stats">
            <span class="stat">{{ app.endpoints?.length ?? 0 }} endpoints</span>
            <span class="stat">{{ app.scenarioCount ?? 0 }} сценариев</span>
          </div>
        </NuxtLink>
      </div>

      <div class="pagination">
        <button :disabled="page <= 1" class="page-btn" @click="changePage(page - 1)">
          Назад
        </button>
        <span class="page-info">Страница {{ page }} из {{ totalPages }}</span>
        <button
          :disabled="page >= totalPages"
          class="page-btn"
          @click="changePage(page + 1)"
        >
          Вперёд
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { App } from "@fuse/shared";

const apps = ref<App[]>([]);
const loading = ref(true);
const page = ref(1);
const limit = 10;
const totalPages = ref(1);

async function fetchApps() {
  loading.value = true;
  const { $api } = useNuxtApp() as any;
  try {
    const { data } = await $api.GET("/api/apps", {
      params: { query: { page: page.value, limit } },
    });
    apps.value = data?.data ?? [];
    totalPages.value = data?.totalPages ?? 1;
  } catch {
    apps.value = [];
  } finally {
    loading.value = false;
  }
}

function changePage(newPage: number) {
  if (newPage < 1 || newPage > totalPages.value) return;
  page.value = newPage;
  fetchApps();
}

onMounted(fetchApps);
</script>

<style scoped>
.apps-page {
  max-width: 1024px;
  margin: 0 auto;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  font-size: 24px;
  font-weight: 800;
  color: #18181b;
  margin: 0;
}

.new-btn {
  padding: 9px 18px;
  border-radius: 8px;
  background: #6366f1;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s;
}

.new-btn:hover {
  background: #4f46e5;
}

.state-text {
  font-size: 15px;
  color: #71717a;
  text-align: center;
  padding: 64px 0;
}

.empty-state {
  text-align: center;
  padding: 64px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.empty-text {
  font-size: 15px;
  color: #a1a1aa;
  margin: 0;
}

.apps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.app-card {
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  padding: 20px;
  text-decoration: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.app-card:hover {
  border-color: #d4d4d8;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.card-name {
  font-size: 16px;
  font-weight: 700;
  color: #18181b;
}

.card-desc {
  font-size: 14px;
  color: #71717a;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-chip {
  font-size: 12px;
  color: #52525b;
  background: #f4f4f5;
  padding: 3px 8px;
  border-radius: 6px;
}

.card-stats {
  display: flex;
  gap: 16px;
  padding-top: 8px;
  border-top: 1px solid #f4f4f5;
}

.stat {
  font-size: 13px;
  color: #a1a1aa;
}

.badge {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 100px;
  white-space: nowrap;
}

.badge-on {
  background: #dcfce7;
  color: #16a34a;
}

.badge-off {
  background: #f4f4f5;
  color: #71717a;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  padding-top: 8px;
}

.page-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  background: #fff;
  color: #18181b;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.page-btn:hover:not(:disabled) {
  background: #f4f4f5;
}

.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.page-info {
  font-size: 14px;
  color: #71717a;
}
</style>
