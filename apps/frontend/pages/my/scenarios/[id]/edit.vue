<template>
  <div class="editor-page">
    <div class="editor-header">
      <div class="header-left">
        <NuxtLink to="/my/scenarios" class="back-btn">← Сценарии</NuxtLink>
        <h1 class="scenario-title">{{ store.scenario?.title || "Сценарий" }}</h1>
        <span v-if="store.distinctAppCount > 1" class="multi-badge">
          {{ store.distinctAppCount }} API
        </span>
      </div>
      <div class="header-right">
        <button class="publish-btn" :class="{ published: store.scenario?.published }" @click="togglePublish">
          {{ store.scenario?.published ? "Снять с публикации" : "Опубликовать" }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="loading">Загрузка сценария...</div>

    <div v-else class="editor-body">
      <div class="step-list-panel">
        <div class="panel-header">
          <h2 class="panel-title">Шаги ({{ store.stepCount }})</h2>
          <button class="add-btn" @click="showPicker = true">+ Добавить шаг</button>
        </div>

        <div v-if="store.stepCount === 0" class="empty-steps">
          Нет шагов. Добавьте первый шаг, чтобы продолжить.
        </div>

        <div v-else class="steps">
          <div
            v-for="(step, idx) in store.scenario?.steps"
            :key="idx"
            :class="['step-item', { selected: store.selectedStepIndex === idx }]"
            @click="store.selectStep(idx)"
          >
            <span class="step-index">{{ idx + 1 }}</span>
            <div class="step-info">
              <span class="step-title">{{ step.title }}</span>
              <span v-if="step.type === 'api'" class="step-method" :style="methodStyle(step.method)">{{ step.method }}</span>
              <span v-if="step.type === 'delay'" class="step-type-label">⏱ {{ step.seconds }}с</span>
              <span v-if="step.type === 'scenario'" class="step-type-label">↳ Сценарий</span>
              <span v-if="step.type === 'file'" class="step-type-label">📎 Файл</span>
              <span v-if="step.type === 'periodic'" class="step-type-label">🔄 Опрос</span>
              <span v-if="step.page" class="page-badge">{{ pageTypeLabel(step.page.type) }}</span>
            </div>
            <div class="step-actions">
              <button class="page-btn" :class="{ active: !!step.page }" @click.stop="openPageEditor(idx)">Страница</button>
              <button v-if="idx > 0" class="move-btn" @click.stop="store.moveStep(idx, idx - 1)">↑</button>
              <button v-if="idx < store.stepCount - 1" class="move-btn" @click.stop="store.moveStep(idx, idx + 1)">↓</button>
              <button class="delete-btn" @click.stop="removeStep(idx)">✕</button>
            </div>
          </div>
        </div>
      </div>

      <div class="config-panel">
        <StepConfig
          v-if="store.selectedStepIndex !== null && selectedStep"
          :step="selectedStep"
          :step-index="store.selectedStepIndex"
          :scenario-id="route.params.id as string"
          @update="onStepUpdate"
        />
        <div v-else class="config-empty">
          Выберите шаг для настройки
        </div>
      </div>
    </div>

    <StepPicker
      v-if="showPicker"
      :scenario-id="route.params.id as string"
      @add="onStepAdd"
      @close="showPicker = false"
    />

    <PageEditor
      v-if="showPageEditor && pageEditorStep !== null"
      :step="pageEditorStep"
      :scenario-id="route.params.id as string"
      @save="onPageSave"
      @close="showPageEditor = false"
    />
  </div>
</template>

<script setup lang="ts">
import type { Step, StepPage } from "@fuse/shared";

const route = useRoute();
const store = useScenarioEditorStore();
const loading = ref(true);
const showPicker = ref(false);
const showPageEditor = ref(false);
const pageEditorStepIndex = ref<number | null>(null);

const pageEditorStep = computed(() => {
  if (pageEditorStepIndex.value === null || !store.scenario) return null;
  return store.scenario.steps[pageEditorStepIndex.value] ?? null;
});

const selectedStep = computed(() => {
  if (store.selectedStepIndex === null || !store.scenario) return null;
  return store.scenario.steps[store.selectedStepIndex] ?? null;
});

async function loadScenario() {
  loading.value = true;
  const { $api } = useNuxtApp() as any;
  try {
    const { data } = await $api.GET(`/api/scenarios/${route.params.id}`, {});
    if (data.value) {
      store.setScenario(data.value);
    }
  } finally {
    loading.value = false;
  }
}

async function saveSteps() {
  if (!store.scenario) return;
  const { $api } = useNuxtApp() as any;
  await $api.PATCH(`/api/scenarios/${route.params.id}`, {
    body: { steps: store.scenario.steps },
  });
}

function onStepAdd(step: Step) {
  store.addStep(step);
  showPicker.value = false;
  saveSteps();
}

function onStepUpdate(step: Step) {
  if (store.selectedStepIndex !== null) {
    store.updateStep(store.selectedStepIndex, step);
    saveSteps();
  }
}

function removeStep(idx: number) {
  store.removeStep(idx);
  saveSteps();
}

function openPageEditor(idx: number) {
  pageEditorStepIndex.value = idx;
  showPageEditor.value = true;
}

function onPageSave(page: StepPage) {
  if (pageEditorStepIndex.value !== null) {
    const step = store.scenario?.steps[pageEditorStepIndex.value];
    if (step) {
      store.updateStep(pageEditorStepIndex.value, { ...step, page });
      saveSteps();
    }
  }
  showPageEditor.value = false;
  pageEditorStepIndex.value = null;
}

async function togglePublish() {
  if (!store.scenario) return;
  if (!store.scenario.published && store.stepCount === 0) {
    alert("Добавьте хотя бы один шаг перед публикацией");
    return;
  }
  const { $api } = useNuxtApp() as any;
  const { data } = await $api.PATCH(`/api/scenarios/${route.params.id}/publish`, {});
  if (data.value) {
    store.scenario.published = data.value.published;
  }
}

function methodStyle(m: string) {
  const colors: Record<string, string> = {
    GET: "#0e9f6e", POST: "#e11d48", PUT: "#d97706", DELETE: "#dc2626", PATCH: "#6366f1",
  };
  const bg: Record<string, string> = {
    GET: "#e7f8f1", POST: "#fdeaef", PUT: "#fef3e2", DELETE: "#fdecec", PATCH: "#eef2ff",
  };
  return { color: colors[m] || "#6366f1", background: bg[m] || "#eef2ff" };
}

function pageTypeLabel(t: string) {
  return t === "fields" ? "📄" : t === "file" ? "📎" : "📝";
}

onMounted(loadScenario);
</script>

<style scoped>
.editor-page { max-width: 1280px; margin: 0 auto; padding: 16px 24px 48px; }
.editor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.header-left { display: flex; align-items: center; gap: 12px; }
.back-btn { font-size: 14px; color: #6366f1; text-decoration: none; }
.scenario-title { font-size: 20px; font-weight: 700; color: #18181b; margin: 0; }
.multi-badge { font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 100px; background: #eef2ff; color: #6366f1; }
.publish-btn { padding: 8px 16px; border-radius: 8px; border: none; background: #16a34a; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
.publish-btn.published { background: #f4f4f5; color: #52525b; }
.loading { text-align: center; padding: 48px; color: #71717a; }
.editor-body { display: grid; grid-template-columns: 1fr 400px; gap: 20px; }
.step-list-panel { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 20px; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.panel-title { font-size: 15px; font-weight: 700; color: #18181b; margin: 0; }
.add-btn { font-size: 13px; font-weight: 600; color: #6366f1; background: #eef2ff; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; }
.empty-steps { text-align: center; padding: 32px; color: #a1a1aa; font-size: 14px; border: 2px dashed #e4e4e7; border-radius: 10px; }
.steps { display: flex; flex-direction: column; gap: 8px; }
.step-item { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid #e4e4e7; border-radius: 8px; cursor: pointer; transition: border-color 0.15s; }
.step-item.selected { border-color: #6366f1; background: #f5f3ff; }
.step-index { width: 24px; height: 24px; border-radius: 50%; background: #f4f4f5; color: #52525b; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.step-info { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
.step-title { font-size: 14px; font-weight: 500; color: #18181b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step-method { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
.step-type-label { font-size: 12px; color: #71717a; }
.page-badge { font-size: 11px; }
.step-actions { display: flex; gap: 4px; }
.page-btn { height: 24px; padding: 0 8px; border: 1px solid #e4e4e7; border-radius: 6px; background: #fff; cursor: pointer; font-size: 11px; color: #71717a; white-space: nowrap; }
.page-btn.active { background: #eef2ff; border-color: #c7d2fe; color: #6366f1; }
.move-btn { width: 24px; height: 24px; border: 1px solid #e4e4e7; border-radius: 6px; background: #fff; cursor: pointer; font-size: 12px; color: #71717a; display: flex; align-items: center; justify-content: center; }
.delete-btn { width: 24px; height: 24px; border: 1px solid #fecaca; border-radius: 6px; background: #fff; cursor: pointer; font-size: 12px; color: #e11d48; display: flex; align-items: center; justify-content: center; }
.config-panel { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 20px; }
.config-empty { text-align: center; padding: 32px; color: #a1a1aa; font-size: 14px; }
</style>
