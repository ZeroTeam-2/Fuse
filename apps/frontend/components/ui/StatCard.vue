<script setup lang="ts">
// Fuse StatCard — a big metric on a card: heavy value over a muted label.
// `valueSize` is a runtime prop (inline font-size).
import { computed } from "vue";

const props = withDefaults(
  defineProps<{ value?: string | number; label?: string; valueSize?: number }>(),
  { valueSize: 34 },
);

const valueStyle = computed(() => ({ fontSize: `${props.valueSize}px` }));
</script>

<template>
  <Card padding="lg">
    <div
      :style="valueStyle"
      class="font-sans font-extrabold leading-none tracking-tight text-zinc-900 mb-2.5"
    >
      <slot>{{ value }}</slot>
    </div>
    <div class="font-sans text-sm text-zinc-500">{{ label }}</div>
  </Card>
</template>
