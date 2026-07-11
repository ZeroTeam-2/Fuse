<script setup lang="ts">
// Dropdown that anchors under the "Добавить шаг" button and lists step types.
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { StepType } from "@fuse/shared";

export interface StepTypeOption {
  key: StepType;
  icon: string;
  title: string;
  desc: string;
}

withDefaults(defineProps<{ size?: "sm" | "md" | "lg"; iconSize?: number }>(), {
  size: "sm",
  iconSize: 16,
});

const emit = defineEmits<{ pick: [type: StepTypeOption] }>();

const STEP_TYPES: StepTypeOption[] = [
  { key: "api", icon: "braces", title: "Endpoint API", desc: "Вызов метода стороннего API" },
  { key: "scenario", icon: "copy", title: "Другой сценарий", desc: "Вложить готовый use-case" },
  { key: "delay", icon: "clock", title: "Задержка", desc: "Пауза между шагами" },
  { key: "file", icon: "upload", title: "Файл", desc: "Загрузка файла пользователем" },
  { key: "periodic", icon: "refresh-cw", title: "Периодический запрос", desc: "Опрос endpoint по интервалу" },
];

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

function onDoc(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) open.value = false;
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") open.value = false;
}

function pick(t: StepTypeOption) {
  open.value = false;
  emit("pick", t);
}

onMounted(() => {
  document.addEventListener("mousedown", onDoc);
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDoc);
  document.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div ref="rootRef" class="relative">
    <Button variant="tint" :size="size" @click="open = !open">
      <template #left><Icon name="plus-circle" :size="iconSize" /></template>
      Добавить шаг
    </Button>
    <div
      v-if="open"
      class="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-40 w-[320px] bg-white border border-zinc-200 rounded-2xl shadow-[0_24px_64px_rgba(24,24,27,0.18)] p-1.5"
    >
      <button
        v-for="t in STEP_TYPES"
        :key="t.key"
        type="button"
        class="flex gap-3 items-center w-full text-left px-2.5 py-2 rounded-xl transition-colors cursor-pointer hover:bg-zinc-100"
        @click="pick(t)"
      >
        <span
          class="w-[34px] h-[34px] rounded-lg shrink-0 inline-flex items-center justify-center bg-zinc-100 text-zinc-500"
        >
          <Icon :name="t.icon" :size="17" />
        </span>
        <span class="min-w-0">
          <span class="block font-sans text-sm font-bold text-zinc-900">{{ t.title }}</span>
          <span class="block font-sans text-[0.78125rem] text-zinc-500 truncate">{{ t.desc }}</span>
        </span>
      </button>
    </div>
  </div>
</template>
