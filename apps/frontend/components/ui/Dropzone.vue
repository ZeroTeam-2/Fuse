<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    accept?: string;
    maxSize?: number;
    disabled?: boolean;
  }>(),
  {
    accept:
      ".json,.yaml,.yml,application/json,application/yaml,application/x-yaml,text/yaml",
    maxSize: 10 * 1024 * 1024,
    disabled: false,
  },
);

const emit = defineEmits<{
  select: [file: File];
  error: [message: string];
}>();

const isDragOver = ref(false);
const selectedFile = ref<File | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const ALLOWED_EXTENSIONS = new Set([".json", ".yaml", ".yml"]);

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function validate(file: File): string | null {
  if (file.size > props.maxSize) {
    const mb = Math.round(props.maxSize / (1024 * 1024));
    return `Размер файла превышает ${mb} МБ`;
  }
  const ext = getExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return "Допустимы только файлы .json, .yaml, .yml";
  }
  return null;
}

function handleFile(file: File) {
  const err = validate(file);
  if (err) {
    selectedFile.value = null;
    emit("error", err);
    return;
  }
  selectedFile.value = file;
  emit("select", file);
}

function onDrop(e: DragEvent) {
  isDragOver.value = false;
  if (props.disabled) return;
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;
  handleFile(files[0]);
}

function onSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    handleFile(target.files[0]);
  }
}

function triggerBrowse() {
  if (!props.disabled) fileInput.value?.click();
}

function clear() {
  selectedFile.value = null;
  if (fileInput.value) fileInput.value.value = "";
}

defineExpose({ clear });
</script>

<template>
  <div
    :class="[
      'rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
      isDragOver
        ? 'border-rose-600 bg-rose-50'
        : 'border-zinc-300 hover:border-rose-400 hover:bg-white',
      disabled && 'opacity-50 pointer-events-none',
    ]"
    @click="triggerBrowse"
    @dragover.prevent="isDragOver = true"
    @dragleave.prevent="isDragOver = false"
    @drop.prevent="onDrop"
  >
    <span v-if="!selectedFile" class="font-sans text-sm text-zinc-500">
      Перетащите файл сюда или нажмите для выбора
      <span class="text-zinc-400">(макс. 10 МБ)</span>
    </span>
    <span v-else class="font-sans text-sm font-semibold text-zinc-900">
      {{ selectedFile.name }}
    </span>
    <input
      ref="fileInput"
      type="file"
      class="hidden"
      :accept="accept"
      :disabled="disabled"
      @change="onSelect"
    />
  </div>
</template>
