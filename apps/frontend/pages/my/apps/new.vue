<template>
  <div
    class="max-w-[720px] mx-auto px-5 lg:px-8 pt-8 pb-20 flex flex-col gap-6"
  >
    <NuxtLink
      to="/my/apps"
      class="font-sans text-sm text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-700"
    >
      ‹ Приложения
    </NuxtLink>

    <!-- Step 1 — spec source -->
    <Card v-if="step === 1" padding="xl" class="flex flex-col gap-6">
      <div>
        <h1
          class="font-sans font-extrabold text-[1.875rem] tracking-tight text-zinc-900"
        >
          Новое приложение
        </h1>
        <p class="font-sans text-[0.9375rem] text-zinc-500 mt-1.5">
          Укажите данные приложения и источник OpenAPI-спецификации
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

        <div class="flex flex-col gap-2">
          <span class="text-[0.8125rem] font-sans font-semibold text-zinc-900">
            Источник спецификации
          </span>
          <SegmentedControl
            v-model="mode"
            :options="[
              { value: 'url', label: 'URL' },
              { value: 'file', label: 'Файл' },
            ]"
          />
        </div>

        <Input
          v-if="mode === 'url'"
          v-model="form.openapiUrl"
          label="OpenAPI URL"
          type="url"
          mono
          placeholder="https://api.example.com/openapi.json"
        />

        <template v-else>
          <div class="flex flex-col gap-2">
            <label
              class="text-[0.8125rem] font-sans font-semibold text-zinc-900"
            >
              Файл спецификации
            </label>
            <Dropzone
              ref="dropzoneRef"
              :max-size="specMaxSizeBytes"
              @select="onFileSelect"
              @error="onFileError"
            />
          </div>

          <Input
            v-model="fileBaseUrl"
            label="Базовый URL API"
            type="url"
            mono
            placeholder="https://api.example.com"
            hint="Укажите, если в спецификации нет поля servers"
          />
        </template>

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
          <h1
            class="font-sans font-extrabold text-[1.875rem] tracking-tight text-zinc-900"
          >
            Предпросмотр спецификации
          </h1>
          <p class="font-sans text-[0.9375rem] text-zinc-500 mt-1.5">
            Спецификация разобрана — найдено
            {{ preview.endpointCount }} endpoints
          </p>
        </div>

        <div
          v-if="previewMeta"
          class="font-mono text-[0.8125rem] text-zinc-400"
        >
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
          <Button variant="secondary" :disabled="creating" @click="goBack"
            >Назад</Button
          >
        </div>
      </Card>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ImportPreviewResult } from "@fuse/shared";

const { $api } = useNuxtApp() as any;

// Лимит размера файла спеки — из публичного конфига (specFileMaxMb), не хардкод.
const runtimeConfig = useRuntimeConfig();
const specMaxSizeBytes = computed(
  () => (runtimeConfig.public.specFileMaxMb as number) * 1024 * 1024,
);

const step = ref(1);
const mode = ref<"url" | "file">("url");
const previewMode = ref<"url" | "file">("url");
const importing = ref(false);
const creating = ref(false);
const importError = ref("");
const createError = ref("");
const preview = ref<ImportPreviewResult | null>(null);
const selectedFile = ref<File | null>(null);
const fileBaseUrl = ref("");
const dropzoneRef = ref<{ clear: () => void } | null>(null);

const form = reactive({
  name: "",
  description: "",
  openapiUrl: "",
});

const previewMeta = computed(() => {
  const p = preview.value;
  if (!p) return "";
  return [p.host, p.apiVersion && `v${p.apiVersion}`]
    .filter(Boolean)
    .join(" · ");
});

watch(mode, () => {
  importError.value = "";
  preview.value = null;
  step.value = 1;
  selectedFile.value = null;
  fileBaseUrl.value = "";
  dropzoneRef.value?.clear();
});

function onFileSelect(file: File) {
  selectedFile.value = file;
  importError.value = "";
}

function onFileError(message: string) {
  selectedFile.value = null;
  importError.value = message;
}

function goBack() {
  step.value = 1;
  preview.value = null;
  createError.value = "";
}

async function importPreview() {
  if (mode.value === "file") {
    await importPreviewFile();
  } else {
    await importPreviewUrl();
  }
}

async function importPreviewUrl() {
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
    previewMode.value = "url";
    step.value = 2;
  } catch {
    importError.value = "Не удалось разобрать спецификацию. Проверьте URL.";
  } finally {
    importing.value = false;
  }
}

async function importPreviewFile() {
  if (!selectedFile.value) {
    importError.value = "Выберите файл спецификации";
    return;
  }
  importing.value = true;
  importError.value = "";
  try {
    const fd = new FormData();
    fd.append("file", selectedFile.value);
    if (fileBaseUrl.value.trim()) {
      fd.append("baseUrl", fileBaseUrl.value.trim());
    }
    const { data, error } = await $api.POST("/api/apps/import-preview-file", {
      body: fd,
    });
    if (error || !data) {
      importError.value = error?.message ?? "Не удалось разобрать спецификацию";
      return;
    }
    preview.value = data;
    previewMode.value = "file";
    step.value = 2;
  } catch {
    importError.value = "Не удалось разобрать спецификацию. Проверьте файл.";
  } finally {
    importing.value = false;
  }
}

async function createApp() {
  if (previewMode.value === "file") {
    await createAppFromFile();
  } else {
    await createAppFromUrl();
  }
}

async function createAppFromUrl() {
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

async function createAppFromFile() {
  if (!selectedFile.value) {
    createError.value = "Файл не выбран";
    return;
  }
  creating.value = true;
  createError.value = "";
  try {
    const fd = new FormData();
    fd.append("file", selectedFile.value);
    fd.append("name", form.name);
    if (form.description) fd.append("description", form.description);
    if (fileBaseUrl.value.trim())
      fd.append("baseUrl", fileBaseUrl.value.trim());
    const { data, error } = await $api.POST("/api/apps/from-file", {
      body: fd,
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
