<script setup lang="ts">
// Fuse brand lockup — the product logo plus the "Fuse" wordmark.
// Size is a runtime prop.
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
}));
const wordStyle = computed(() => ({ fontSize: `${props.size * 0.66}px` }));
</script>

<template>
  <span class="inline-flex items-center" :style="rootStyle">
    <img
      src="~/assets/images/Logo_64_64.svg"
      alt=""
      aria-hidden="true"
      class="shrink-0 select-none"
      :style="markStyle"
    />
    <span
      v-if="showWordmark"
      class="font-sans font-bold tracking-tight text-zinc-900"
      :style="wordStyle"
    >
      {{ wordmark }}
    </span>
  </span>
</template>
