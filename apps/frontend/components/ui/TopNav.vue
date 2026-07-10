<script setup lang="ts">
// Fuse TopNav — global product header: brand lockup, primary nav with an
// active rose pill, and the user avatar.
export interface TopNavItem {
  label: string;
  active?: boolean;
  [key: string]: unknown;
}

withDefaults(
  defineProps<{
    items?: TopNavItem[];
    user?: { name: string; src?: string | null };
  }>(),
  { items: () => [], user: () => ({ name: "Анна Ковалёва" }) },
);

const emit = defineEmits<{ navigate: [item: TopNavItem]; profile: [] }>();
</script>

<template>
  <header class="flex items-center h-16 px-4 lg:px-8 bg-white border-b border-zinc-200">
    <div class="mr-10"><BrandMark :size="30" /></div>
    <nav class="flex items-center gap-1.5">
      <button
        v-for="it in items"
        :key="it.label"
        type="button"
        :class="[
          'font-sans font-semibold text-[0.9375rem] px-3.5 py-2 rounded-lg cursor-pointer transition-colors',
          it.active ? 'bg-rose-50 text-rose-600' : 'text-zinc-700 hover:bg-zinc-100',
        ]"
        @click="emit('navigate', it)"
      >
        {{ it.label }}
      </button>
    </nav>
    <div class="ml-auto">
      <button
        type="button"
        aria-label="Профиль"
        class="border-0 bg-transparent p-0 inline-flex cursor-pointer"
        @click="emit('profile')"
      >
        <Avatar :name="user.name" :src="user.src" :size="38" />
      </button>
    </div>
  </header>
</template>
