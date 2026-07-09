<template>
  <div class="new-app-page">
    <div class="top-bar">
      <NuxtLink to="/my/apps" class="back-link">← Все приложения</NuxtLink>
    </div>

    <div v-if="step === 1" class="wizard-card">
      <h1 class="wizard-title">Новое приложение</h1>
      <p class="wizard-subtitle">
        Укажите данные приложения и ссылку на OpenAPI-спецификацию
      </p>

      <form class="wizard-form" @submit.prevent="importPreview">
        <label class="form-label">
          Название
          <input
            v-model="form.name"
            type="text"
            class="form-input"
            placeholder="My API"
            required
          />
        </label>
        <label class="form-label">
          Описание
          <textarea
            v-model="form.description"
            class="form-input form-textarea"
            placeholder="Краткое описание API"
            rows="3"
          />
        </label>
        <label class="form-label">
          OpenAPI URL
          <input
            v-model="form.openapiUrl"
            type="url"
            class="form-input"
            placeholder="https://api.example.com/openapi.json"
            required
          />
        </label>

        <div v-if="importError" class="error-box">{{ importError }}</div>

        <div class="form-actions">
          <button
            type="submit"
            class="primary-btn"
            :disabled="importing"
          >
            {{ importing ? "Импорт…" : "Импортировать" }}
          </button>
        </div>
      </form>
    </div>

    <div v-if="step === 2 && preview" class="wizard-card">
      <h1 class="wizard-title">Предпросмотр спецификации</h1>
      <p class="result-text">
        Спецификация разобрана — найдено {{ preview.endpointCount }} endpoints
      </p>

      <div v-if="preview.host || preview.apiVersion" class="preview-meta">
        <span v-if="preview.host" class="chip">{{ preview.host }}</span>
        <span v-if="preview.apiVersion" class="chip">v{{ preview.apiVersion }}</span>
      </div>

      <div class="endpoint-preview-list">
        <div
          v-for="(ep, i) in preview.endpoints"
          :key="i"
          class="endpoint-row"
        >
          <span :class="['method-badge', methodClass(ep.method)]">
            {{ ep.method }}
          </span>
          <span class="endpoint-path">{{ ep.path }}</span>
          <span v-if="ep.summary" class="endpoint-summary">{{ ep.summary }}</span>
        </div>
      </div>

      <div v-if="createError" class="error-box">{{ createError }}</div>

      <div class="form-actions">
        <button class="ghost-btn" :disabled="creating" @click="step = 1">
          Назад
        </button>
        <button
          class="primary-btn"
          :disabled="creating"
          @click="createApp"
        >
          {{ creating ? "Создание…" : "Создать приложение" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ImportPreviewResult } from "@fuse/shared";

const step = ref(1);
const importing = ref(false);
const creating = ref(false);
const importError = ref("");
const createError = ref("");
const preview = ref<ImportPreviewResult | null>(null);

const form = reactive({
  name: "",
  description: "",
  openapiUrl: "",
});

async function importPreview() {
  importing.value = true;
  importError.value = "";
  const { $api } = useNuxtApp() as any;
  try {
    const { data, error } = await $api.POST("/api/apps/import-preview", {
      body: { openapiUrl: form.openapiUrl },
    });
    if (error || !data) {
      importError.value = error?.message ?? "Не удалось разобрать спецификацию";
      return;
    }
    preview.value = data;
    step.value = 2;
  } catch {
    importError.value = "Не удалось разобрать спецификацию. Проверьте URL.";
  } finally {
    importing.value = false;
  }
}

async function createApp() {
  creating.value = true;
  createError.value = "";
  const { $api } = useNuxtApp() as any;
  try {
    const { data, error } = await $api.POST("/api/apps", {
      body: {
        name: form.name,
        description: form.description || undefined,
        openapiUrl: form.openapiUrl,
      },
    });
    if (error || !data) {
      createError.value = error?.message ?? "Не удалось создать приложение";
      return;
    }
    await navigateTo(`/my/apps/${data.id}`);
  } catch {
    createError.value = "Не удалось создать приложение";
  } finally {
    creating.value = false;
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
</script>

<style scoped>
.new-app-page {
  max-width: 720px;
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

.wizard-card {
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.wizard-title {
  font-size: 22px;
  font-weight: 800;
  color: #18181b;
  margin: 0;
}

.wizard-subtitle {
  font-size: 15px;
  color: #71717a;
  margin: 0;
}

.wizard-form {
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

.form-textarea {
  resize: vertical;
  font-family: inherit;
}

.error-box {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 14px;
  color: #e11d48;
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

.ghost-btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid #e4e4e7;
  background: #fff;
  color: #52525b;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.ghost-btn:hover {
  background: #f4f4f5;
}

.result-text {
  font-size: 15px;
  color: #52525b;
  margin: 0;
}

.preview-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  font-size: 12px;
  color: #52525b;
  background: #f4f4f5;
  padding: 3px 10px;
  border-radius: 6px;
}

.endpoint-preview-list {
  display: flex;
  flex-direction: column;
  border: 1px solid #f4f4f5;
  border-radius: 8px;
  overflow: hidden;
}

.endpoint-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
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
