<script setup lang="ts">
// Карточка файла запуска (эталон: FileSection в Runs.jsx): имя, тип, размер и
// «Скачать». Ссылка не хранится в результате — presigned URL запрашивается по
// клику у `GET /api/runs/:id/file-link` и открывается в новой вкладке.
import type { UploadedFileRef } from "@fuse/shared";

const props = withDefaults(
  defineProps<{
    file: UploadedFileRef;
    runId: string;
    /** output — артефакт (зелёная иконка), input — загрузка пользователя. */
    kind?: "input" | "output";
  }>(),
  { kind: "output" },
);

const { $api } = useNuxtApp() as any;
const downloading = ref(false);

const sizeLabel = computed(() => {
  const bytes = props.file.fileSize ?? 0;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${bytes} Б`;
});

async function download() {
  if (downloading.value) return;
  downloading.value = true;
  try {
    const { data } = await $api.GET("/api/runs/{id}/file-link", {
      params: {
        path: { id: props.runId },
        query: { objectName: props.file.objectName },
      },
    });
    const url = (data as { url?: string } | undefined)?.url;
    if (url) window.open(url, "_blank", "noopener");
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <Card padding="none" class="flex items-center gap-3 px-3.5 py-2.5">
    <span
      class="w-9 h-9 rounded-lg inline-flex items-center justify-center shrink-0"
      :class="kind === 'output' ? 'bg-green-50 text-green-600' : 'bg-zinc-100 text-zinc-500'"
    >
      <Icon :name="kind === 'output' ? 'file-check' : 'file-text'" :size="18" />
    </span>
    <div class="min-w-0">
      <div class="font-mono text-[0.8125rem] text-zinc-900 truncate">{{ file.fileName }}</div>
      <div class="font-sans text-xs text-zinc-400">{{ file.fileType }} · {{ sizeLabel }}</div>
    </div>
    <Button
      variant="secondary"
      size="sm"
      class="ml-auto shrink-0"
      :disabled="downloading"
      @click="download"
    >
      <template #left><Icon name="download" :size="15" /></template>
      {{ downloading ? "Готовим…" : "Скачать" }}
    </Button>
  </Card>
</template>
