<template>
  <div class="max-w-[720px] mx-auto px-5 lg:px-8 pt-8 pb-20 flex flex-col gap-6">
    <div class="flex items-center justify-between">
      <NuxtLink
        :to="`/cards/${scenarioId}`"
        class="font-sans text-sm text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-700"
      >
        ‹ Назад
      </NuxtLink>
      <NuxtLink
        :to="`/cards/${scenarioId}/playground`"
        class="font-sans text-sm font-semibold text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-900"
      >
        Playground ›
      </NuxtLink>
    </div>

    <div v-if="title">
      <h1 class="font-sans font-extrabold text-[1.875rem] tracking-tight text-zinc-900">
        {{ title }}
      </h1>
      <p v-if="tagline" class="font-sans text-[0.9375rem] text-zinc-500 mt-1.5">{{ tagline }}</p>
    </div>

    <RunPanel :scenario-id="scenarioId" @loaded="onLoaded" />
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const scenarioId = computed(() => route.params.id as string);

const title = ref("");
const tagline = ref<string | undefined>();

function onLoaded(s: { title: string; tagline?: string }) {
  title.value = s.title;
  tagline.value = s.tagline;
}
</script>
