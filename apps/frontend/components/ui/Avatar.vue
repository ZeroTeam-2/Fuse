<script setup lang="ts">
// Fuse Avatar — user identity chip. Gradient pink→magenta fill with initials,
// or an image when `src` is provided. Round. Size is a runtime prop (inline).
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    name?: string;
    src?: string | null;
    size?: number;
  }>(),
  { name: "", src: null, size: 40 },
);

const initials = computed(() =>
  props.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join(""),
);

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.round(props.size * 0.38)}px`,
  ...(props.src
    ? { backgroundImage: `url(${props.src})`, backgroundSize: "cover", backgroundPosition: "center" }
    : {}),
}));
</script>

<template>
  <span
    :style="style"
    :class="[
      'inline-flex items-center justify-center rounded-full shrink-0 select-none text-white font-sans font-bold',
      src ? '' : 'bg-[linear-gradient(140deg,#f43f68_0%,#c026d3_100%)]',
    ]"
  >
    <template v-if="!src">{{ initials }}</template>
  </span>
</template>
