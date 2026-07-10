<script setup lang="ts">
// Fuse AppRow — a connected-API list row (Приложения / Мои API). Provider mark,
// name + description + mono meta, optional status badge, stat pairs, chevron.
import { computed, getCurrentInstance } from "vue";

export interface AppRowStat {
  value: string | number;
  label: string;
}

const props = withDefaults(
  defineProps<{
    name?: string;
    description?: string;
    meta?: string;
    status?: string | null;
    stats?: AppRowStat[];
  }>(),
  { status: "Опубликован", stats: () => [] },
);

const emit = defineEmits<{ click: [] }>();

const inst = getCurrentInstance();
const clickable = computed(() => !!inst?.vnode.props?.onClick);
</script>

<template>
  <div
    :class="[
      'flex items-center gap-[18px] px-[22px] py-[18px] bg-white border border-zinc-200 rounded-2xl shadow-sm transition-shadow',
      clickable ? 'cursor-pointer hover:shadow-lg' : '',
    ]"
    @click="emit('click')"
  >
    <ProviderIcon :name="name" :size="44" />
    <div class="min-w-0 flex-1">
      <div class="font-sans font-bold text-lg text-zinc-900">{{ name }}</div>
      <div v-if="description" class="font-sans text-sm text-zinc-500 mt-0.5">{{ description }}</div>
      <div v-if="meta" class="font-mono text-[0.8125rem] text-zinc-400 mt-1">{{ meta }}</div>
    </div>
    <Badge v-if="status" tone="success" dot>{{ status }}</Badge>
    <div v-for="(s, i) in stats" :key="i" class="text-center min-w-[56px]">
      <div class="font-sans font-bold text-lg text-zinc-900">{{ s.value }}</div>
      <div class="font-sans text-xs text-zinc-400">{{ s.label }}</div>
    </div>
    <span class="inline-flex text-zinc-400">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </span>
  </div>
</template>
