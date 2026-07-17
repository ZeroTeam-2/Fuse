<script setup lang="ts">
// Fuse Pagination — prev/next arrows around a windowed set of page chips. Shows
// the first and last page plus a window around the current one, with ellipses
// for the skipped ranges ("1 … 4 5 6 … 20"), so the control never stretches
// past a handful of chips regardless of pageCount. Two-way via v-model:page.
import { computed } from "vue";

const props = withDefaults(
  defineProps<{ pageCount?: number; siblingCount?: number }>(),
  { pageCount: 1, siblingCount: 1 },
);
const emit = defineEmits<{ change: [page: number] }>();
const page = defineModel<number>("page", { default: 1 });

const ELLIPSIS = "…";

// Numbers to render, with ELLIPSIS markers for gaps. Always includes page 1 and
// the last page; a window of `siblingCount` on each side of the current page.
const items = computed<(number | typeof ELLIPSIS)[]>(() => {
  const total = Math.max(1, props.pageCount);
  const current = Math.min(Math.max(page.value, 1), total);
  const sib = props.siblingCount;

  const start = Math.max(current - sib, 1);
  const end = Math.min(current + sib, total);

  const out: (number | typeof ELLIPSIS)[] = [];
  out.push(1);
  if (start > 2) out.push(ELLIPSIS);
  for (let p = start; p <= end; p++) {
    if (p !== 1 && p !== total) out.push(p);
  }
  if (end < total - 1) out.push(ELLIPSIS);
  if (total !== 1) out.push(total);
  return out;
});

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

    <template v-for="(it, i) in items" :key="typeof it === 'number' ? `p${it}` : `gap${i}`">
      <span
        v-if="it === ELLIPSIS"
        class="min-w-[40px] h-10 inline-flex items-center justify-center font-sans text-sm text-zinc-400 select-none"
        >{{ ELLIPSIS }}</span
      >
      <button
        v-else
        type="button"
        :class="chipCls(it === page, false)"
        @click="go(it)"
      >
        {{ it }}
      </button>
    </template>

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
