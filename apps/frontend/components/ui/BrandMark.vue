<script setup lang="ts">
// Fuse brand lockup — the crimson rounded-square mark (white glyph) plus the
// "Fuse" wordmark. Reproduces the in-product mark. Size is a runtime prop.
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    size?: number;
    showWordmark?: boolean;
    wordmark?: string;
  }>(),
  { size: 32, showWordmark: true, wordmark: "Fuse" },
);

const rootStyle = computed(() => ({ gap: `${props.size * 0.34}px` }));
const markStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: `${props.size * 0.32}px`,
  fontSize: `${props.size * 0.62}px`,
}));
const wordStyle = computed(() => ({ fontSize: `${props.size * 0.66}px` }));
</script>

<template>
  <span class="inline-flex items-center" :style="rootStyle">
    <span
      aria-hidden="true"
      class="inline-flex items-center justify-center shrink-0 bg-rose-600 text-white font-sans font-bold leading-none"
      :style="markStyle"
    >
      c
    </span>
    <span
      v-if="showWordmark"
      class="font-sans font-bold tracking-tight text-zinc-900"
      :style="wordStyle"
    >
      {{ wordmark }}
    </span>
  </span>
</template>
