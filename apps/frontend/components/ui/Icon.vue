<script setup lang="ts">
// Fuse Icon — thin wrapper over lucide-vue-next. Resolves a Lucide glyph by its
// kebab-case name (<Icon name="search" />) and renders it at the given size
// using currentColor. Mirrors the design-system Icon API (name/size/strokeWidth).
import { computed } from "vue";
import * as lucide from "lucide-vue-next";

const props = withDefaults(
  defineProps<{
    name: string;
    size?: number;
    strokeWidth?: number;
    color?: string;
  }>(),
  { size: 20, strokeWidth: 2, color: "currentColor" },
);

function toPascal(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

const IconComp = computed(() => {
  const key = toPascal(props.name);
  const lib = lucide as Record<string, unknown>;
  return (lib[key] || lib[`${key}Icon`] || null) as unknown;
});
</script>

<template>
  <component
    :is="IconComp"
    v-if="IconComp"
    :size="size"
    :stroke-width="strokeWidth"
    :color="color"
    aria-hidden="true"
    style="display: block; flex: 0 0 auto"
  />
  <span
    v-else
    aria-hidden="true"
    :style="{ width: `${size}px`, height: `${size}px`, display: 'inline-block', flex: '0 0 auto' }"
  />
</template>
