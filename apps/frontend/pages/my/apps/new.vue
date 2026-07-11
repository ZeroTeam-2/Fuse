<template>
  <div class="max-w-[720px] mx-auto px-5 lg:px-8 pt-8 pb-20 flex flex-col gap-6">
    <NuxtLink
      to="/my/apps"
      class="font-sans text-sm text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-700"
    >
      ‹ Приложения
    </NuxtLink>

    <!-- Step 1 — spec URL -->
    <Card v-if="step === 1" padding="xl" class="flex flex-col gap-6">
      <div>
        <h1 class="font-sans font-extrabold text-[1.875rem] tracking-tight text-zinc-900">
          Новое приложение
        </h1>
        <p class="font-sans text-[0.9375rem] text-zinc-500 mt-1.5">
          Укажите данные приложения и ссылку на OpenAPI-спецификацию
        </p>
      </div>

      <form class="flex flex-col gap-5" @submit.prevent="importPreview">
        <Input v-model="form.name" label="Название" placeholder="My API" />

        <div class="flex flex-col gap-2">
          <label
            for="app-description"
            class="text-[0.8125rem] font-sans font-semibold text-zinc-900"
          >
            Описание
          </label>
          <textarea
            id="app-description"
            v-model="form.description"
            rows="3"
            placeholder="Краткое описание API"
            class="w-full px-3.5 py-3 font-sans text-[0.9375rem] text-zinc-900 bg-white border border-zinc-200 rounded-xl outline-none transition resize-y placeholder:text-zinc-400 focus:border-rose-600 focus:ring-4 focus:ring-rose-600/20"
          />
        </div>

        <Input
          v-model="form.openapiUrl"
          label="OpenAPI URL"
          type="url"
          mono
          placeholder="https://api.example.com/openapi.json"
        />

        <p
          v-if="importError"
          class="font-sans text-[0.8125rem] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5"
        >
          {{ importError }}
        </p>

        <div>
          <Button variant="primary" type="submit" :disabled="importing">
            {{ importing ? "Импорт…" : "Импортировать" }}
            <template #right><Icon name="arrow-right" :size="18" /></template>
          </Button>
        </div>
      </form>
    </Card>

    <!-- Step 2 — parsed spec preview -->
    <template v-else-if="preview">
      <Card padding="xl" class="flex flex-col gap-5">
        <div>
          <h1 class="font-sans font-extrabold text-[1.875rem] tracking-tight text-zinc-900">
            Предпросмотр спецификации
          </h1>
          <p class="font-sans text-[0.9375rem] text-zinc-500 mt-1.5">
            Спецификация разобрана — найдено {{ preview.endpointCount }} endpoints
          </p>
        </div>

        <div v-if="previewMeta" class="font-mono text-[0.8125rem] text-zinc-400">
          {{ previewMeta }}
        </div>

        <Card padding="sm">
          <EndpointRow
            v-for="(ep, i) in preview.endpoints"
            :key="i"
            :method="ep.method"
            :path="ep.path"
            :description="ep.summary"
          />
        </Card>

        <p
          v-if="createError"
          class="font-sans text-[0.8125rem] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5"
        >
          {{ createError }}
        </p>

        <div class="flex items-center gap-2.5">
          <Button variant="primary" :disabled="creating" @click="createApp">
            {{ creating ? "Создание…" : "Создать приложение" }}
          </Button>
          <Button variant="secondary" :disabled="creating" @click="step = 1">Назад</Button>
        </div>
      </Card>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ImportPreviewResult } from "@fuse/shared";

const { $api } = useNuxtApp() as any;

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

const previewMeta = computed(() => {
  const p = preview.value;
  if (!p) return "";
  return [p.host, p.apiVersion && `v${p.apiVersion}`].filter(Boolean).join(" · ");
});

async function importPreview() {
  importing.value = true;
  importError.value = "";
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
</script>
