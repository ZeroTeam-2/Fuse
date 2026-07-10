<script setup lang="ts">
// Fuse StepProgress — the scenario run status list. Each step shows a status
// mark (done ✓ / active spinner / pending number), a label, and optional right
// meta. Optional `heading` row on top with its own status.
import { computed } from "vue";

type Status = "done" | "active" | "pending";

export interface Step {
  label: string;
  status?: Status;
  meta?: string;
}

const props = withDefaults(
  defineProps<{ steps?: Step[]; heading?: { label: string; status?: Status } | null }>(),
  { steps: () => [], heading: null },
);

interface Row {
  label: string;
  status: Status;
  index: number;
  meta?: string;
  heading: boolean;
}

const rows = computed<Row[]>(() => {
  const r: Row[] = [];
  if (props.heading) {
    r.push({ label: props.heading.label, status: props.heading.status || "active", index: 0, heading: true });
  }
  props.steps.forEach((s, i) => {
    r.push({ label: s.label, status: s.status || "pending", index: i + 1, meta: s.meta, heading: false });
  });
  return r;
});

const MARK_BASE =
  "w-[26px] h-[26px] rounded-full shrink-0 inline-flex items-center justify-center font-sans font-bold text-[0.8125rem]";
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <div v-for="(row, i) in rows" :key="i" class="flex items-center gap-3">
      <!-- StatusMark -->
      <span v-if="row.status === 'done'" :class="[MARK_BASE, 'bg-green-600 text-white']">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span
        v-else-if="row.status === 'active'"
        :class="[MARK_BASE, 'border-[2.5px] border-rose-200 border-t-rose-600 animate-spin']"
      />
      <span v-else :class="[MARK_BASE, 'border-2 border-rose-300 text-rose-600 bg-white']">{{
        row.index
      }}</span>

      <span
        :class="[
          'font-sans font-bold text-zinc-900',
          row.heading ? 'text-base' : 'text-[0.9375rem]',
        ]"
        >{{ row.label }}</span
      >
      <span v-if="row.meta" class="ml-auto font-sans text-sm text-zinc-500">{{ row.meta }}</span>
    </div>
  </div>
</template>
