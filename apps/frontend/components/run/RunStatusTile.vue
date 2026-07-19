<script setup lang="ts">
// Плитка статуса запуска из эталона DS (StatusTile в Runs.jsx): цветной
// квадрат с иконкой, для running — спиннер.
import type { RunStatus } from "@fuse/shared";

const props = withDefaults(
  defineProps<{ status: RunStatus; size?: number }>(),
  { size: 40 },
);

const cfg = computed(() => RUN_STATUS_UI[props.status] ?? RUN_STATUS_UI.pending);
</script>

<template>
  <span
    class="rounded-xl inline-flex items-center justify-center shrink-0"
    :class="cfg.tile"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <span
      v-if="status === 'running'"
      class="rounded-full border-[2.5px] border-rose-200 border-t-rose-600 animate-spin"
      :style="{ width: `${size * 0.44}px`, height: `${size * 0.44}px` }"
    />
    <Icon v-else-if="cfg.icon" :name="cfg.icon" :size="size * 0.5" />
  </span>
</template>
