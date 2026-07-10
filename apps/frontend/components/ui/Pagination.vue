<script setup lang="ts">
// Fuse Pagination — prev/next arrows around numbered page chips. Active page is
// an ink-filled chip; others are outlined white. Two-way via v-model:page.
import { computed } from "vue";

const props = withDefaults(defineProps<{ pageCount?: number }>(), { pageCount: 1 });
const emit = defineEmits<{ change: [page: number] }>();
const page = defineModel<number>("page", { default: 1 });

const pages = computed(() => Array.from({ length: props.pageCount }, (_, i) => i + 1));

const BASE =
  "min-w-[40px] h-10 px-2.5 inline-flex items-center justify-center rounded-lg font-sans font-semibold text-sm transition-colors";

function go(p: number) {
  if (p >= 1 && p <= props.pageCount && p !== page.value) {
    page.value = p;
    emit("change", p);
  }
}

function chipCls(active: boolean, disabled: boolean) {
  return [
    BASE,
    active
      ? "bg-zinc-900 text-white"
      : "bg-white text-zinc-700 border border-zinc-200 shadow-sm hover:bg-zinc-100",
    disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
  ];
}
</script>

<template>
  <div class="inline-flex gap-2">
    <button type="button" :disabled="page <= 1" :class="chipCls(false, page <= 1)" @click="go(page - 1)">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
    <button
      v-for="p in pages"
      :key="p"
      type="button"
      :class="chipCls(p === page, false)"
      @click="go(p)"
    >
      {{ p }}
    </button>
    <button
      type="button"
      :disabled="page >= pageCount"
      :class="chipCls(false, page >= pageCount)"
      @click="go(page + 1)"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  </div>
</template>
