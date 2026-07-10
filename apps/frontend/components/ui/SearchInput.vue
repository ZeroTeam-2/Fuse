<script setup lang="ts">
// Fuse SearchInput — rounded search field with a leading magnifier and a
// trailing "/" shortcut hint (hidden while focused/filled). Two-way via v-model.
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    placeholder?: string;
    shortcut?: string;
    width?: number | string;
  }>(),
  { placeholder: "Найти сценарий или сервис…", shortcut: "/", width: 320 },
);

const model = defineModel<string>({ default: "" });
const focus = ref(false);

const rootStyle = computed(() => ({
  width: typeof props.width === "number" ? `${props.width}px` : props.width,
}));
</script>

<template>
  <div
    :style="rootStyle"
    :class="[
      'flex items-center gap-2.5 max-w-full px-3.5 py-2.5 bg-white border rounded-xl transition',
      focus ? 'border-rose-600 ring-4 ring-rose-600/20' : 'border-zinc-200 shadow-sm',
    ]"
  >
    <span class="inline-flex text-zinc-400 shrink-0">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </span>
    <input
      v-model="model"
      type="text"
      :placeholder="placeholder"
      class="flex-1 min-w-0 border-0 outline-none bg-transparent font-sans text-[0.9375rem] text-zinc-900 placeholder:text-zinc-400"
      @focus="focus = true"
      @blur="focus = false"
    />
    <kbd
      v-if="shortcut && !focus && !model"
      class="font-mono text-xs text-zinc-400 border border-zinc-200 rounded-md px-1.5 py-0.5 bg-zinc-100 shrink-0"
      >{{ shortcut }}</kbd
    >
  </div>
</template>
