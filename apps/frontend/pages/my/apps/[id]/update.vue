<template>
  <div class="update-page">
    <div class="top-bar">
      <NuxtLink :to="`/my/apps/${appId}`" class="back-link">← Назад к приложению</NuxtLink>
    </div>

    <div v-if="loading" class="state-text">Загрузка…</div>

    <template v-else-if="app">
      <div class="info-card">
        <div class="info-header">
          <h1 class="app-title">{{ app.name }}</h1>
          <span :class="['badge', app.published ? 'badge-on' : 'badge-off']">
            {{ app.published ? "Опубликован" : "Скрыт" }}
          </span>
        </div>
        <div class="info-meta">
          <span v-if="app.host" class="chip">{{ app.host }}</span>
          <span v-if="app.apiVersion" class="chip">v{{ app.apiVersion }}</span>
          <span class="chip">{{ app.endpoints?.length ?? 0 }} endpoints</span>
        </div>
      </div>

      <div class="reimport-card">
        <h2 class="section-title">Проверить обновления</h2>
        <form class="reimport-form" @submit.prevent="checkUpdates">
          <label class="form-label">
            OpenAPI URL
            <input
              v-model="openapiUrl"
              type="url"
              class="form-input"
              placeholder="https://api.example.com/openapi.json"
              required
            />
          </label>

          <div v-if="reimportError" class="error-box">{{ reimportError }}</div>

          <div class="form-actions">
            <button type="submit" class="primary-btn" :disabled="checking">
              {{ checking ? "Проверка…" : "Проверить обновления" }}
            </button>
          </div>
        </form>
      </div>

      <div v-if="diff" class="diff-card">
        <div v-if="diff.added.length > 0" class="diff-section">
          <h3 class="diff-title diff-added-title">
            Новые endpoints ({{ diff.added.length }})
          </h3>
          <div class="endpoint-list">
            <div
              v-for="(ep, i) in diff.added"
              :key="`a-${i}`"
              class="endpoint-row"
            >
              <span :class="['method-badge', methodClass(ep.method)]">{{ ep.method }}</span>
              <span class="endpoint-path">{{ ep.path }}</span>
              <span v-if="ep.summary" class="endpoint-summary">{{ ep.summary }}</span>
              <span class="diff-tag diff-tag-new">НОВЫЙ</span>
            </div>
          </div>
        </div>

        <div v-if="diff.kept.length > 0" class="diff-section">
          <h3 class="diff-title diff-kept-title">
            Без изменений ({{ diff.kept.length }})
          </h3>
          <div class="endpoint-list">
            <div
              v-for="(ep, i) in diff.kept"
              :key="`k-${i}`"
              class="endpoint-row"
            >
              <span :class="['method-badge', methodClass(ep.method)]">{{ ep.method }}</span>
              <span class="endpoint-path">{{ ep.path }}</span>
              <span v-if="ep.summary" class="endpoint-summary">{{ ep.summary }}</span>
            </div>
          </div>
        </div>

        <div v-if="diff.deprecated.length > 0" class="diff-section">
          <h3 class="diff-title diff-deprecated-title">
            Удалённые endpoints ({{ diff.deprecated.length }})
          </h3>
          <div class="endpoint-list">
            <div
              v-for="(ep, i) in diff.deprecated"
              :key="`d-${i}`"
              class="endpoint-row deprecated-row"
            >
              <span :class="['method-badge', methodClass(ep.method)]">{{ ep.method }}</span>
              <span class="endpoint-path">{{ ep.path }}</span>
              <span v-if="ep.summary" class="endpoint-summary">{{ ep.summary }}</span>
              <span class="diff-tag diff-tag-dep">УДАЛЁН</span>
            </div>
          </div>
        </div>

        <div v-if="diff.added.length === 0 && diff.kept.length === 0 && diff.deprecated.length === 0" class="no-changes">
          Изменений не обнаружено
        </div>

        <div v-if="successMessage" class="success-box">{{ successMessage }}</div>

        <div class="form-actions">
          <button class="primary-btn" :disabled="saving" @click="saveUpdate">
            {{ saving ? "Сохранение…" : "Сохранить обновление" }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { App, ReimportDiff } from "@fuse/shared";

const route = useRoute();
const appId = route.params.id as string;

const app = ref<App | null>(null);
const loading = ref(true);
const openapiUrl = ref("");
const diff = ref<ReimportDiff | null>(null);
const checking = ref(false);
const saving = ref(false);
const reimportError = ref("");
const successMessage = ref("");

async function fetchApp() {
  loading.value = true;
  const { $api } = useNuxtApp() as any;
  try {
    const { data } = await $api.GET("/api/apps/{id}", {
      params: { path: { id: appId } },
    });
    app.value = data ?? null;
    openapiUrl.value = data?.openapiUrl ?? "";
  } catch {
    app.value = null;
  } finally {
    loading.value = false;
  }
}

async function checkUpdates() {
  checking.value = true;
  reimportError.value = "";
  successMessage.value = "";
  const { $api } = useNuxtApp() as any;
  try {
    const { data, error } = await $api.POST("/api/apps/{id}/reimport", {
      params: { path: { id: appId } },
      body: { openapiUrl: openapiUrl.value },
    });
    if (error || !data) {
      reimportError.value = error?.message ?? "Не удалось проверить обновления";
      return;
    }
    diff.value = data;
  } catch {
    reimportError.value = "Не удалось проверить обновления. Проверьте URL.";
  } finally {
    checking.value = false;
  }
}

async function saveUpdate() {
  saving.value = true;
  const { $api } = useNuxtApp() as any;
  try {
    await $api.PATCH("/api/apps/{id}", {
      params: { path: { id: appId } },
      body: { openapiUrl: openapiUrl.value },
    });
    successMessage.value = "Обновление успешно сохранено";
    diff.value = null;
  } catch {
    reimportError.value = "Не удалось сохранить обновление";
  } finally {
    saving.value = false;
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

onMounted(fetchApp);
</script>

<style scoped>
.update-page {
  max-width: 840px;
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

.info-card,
.reimport-card,
.diff-card {
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.app-title {
  font-size: 22px;
  font-weight: 800;
  color: #18181b;
  margin: 0;
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

.info-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  font-size: 12px;
  color: #52525b;
  background: #f4f4f5;
  padding: 3px 10px;
  border-radius: 6px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #18181b;
  margin: 0;
}

.reimport-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: #71717a;
  font-weight: 500;
}

.form-input {
  padding: 10px 12px;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  font-size: 14px;
  color: #18181b;
  background: #fff;
  outline: none;
  transition: border-color 0.15s;
}

.form-input:focus {
  border-color: #6366f1;
}

.error-box {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  color: #e11d48;
}

.success-box {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  color: #16a34a;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.primary-btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  background: #6366f1;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.primary-btn:hover:not(:disabled) {
  background: #4f46e5;
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.diff-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.diff-title {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 4px;
}

.diff-added-title {
  color: #16a34a;
}

.diff-kept-title {
  color: #71717a;
}

.diff-deprecated-title {
  color: #e11d48;
}

.endpoint-list {
  display: flex;
  flex-direction: column;
}

.endpoint-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f4f4f5;
}

.endpoint-row:last-child {
  border-bottom: none;
}

.deprecated-row {
  opacity: 0.6;
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

.diff-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.diff-tag-new {
  background: #16a34a;
  color: #fff;
}

.diff-tag-dep {
  background: #e11d48;
  color: #fff;
}

.no-changes {
  font-size: 14px;
  color: #a1a1aa;
  text-align: center;
  padding: 16px 0;
}
</style>
