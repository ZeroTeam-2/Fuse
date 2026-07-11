<template>
  <div class="max-w-[1180px] xl:max-w-[1320px] mx-auto px-5 lg:px-8 pt-8 lg:pt-12 pb-20">
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6 mb-9">
      <div class="max-w-[640px]">
        <h1
          class="font-sans font-extrabold text-[2rem] md:text-[2.75rem] leading-tight tracking-tight text-zinc-900 mb-3"
        >
          Приложения
        </h1>
        <p class="font-sans text-base text-zinc-500 leading-normal">
          Подключённые API. Управляйте спецификациями и endpoints — сценарии собираются из них на
          вкладке «Мои сценарии».
        </p>
      </div>
      <Button variant="primary" @click="navigateTo('/my/apps/new')">
        <template #left><Icon name="plus" :size="18" /></template>
        Создать приложение
      </Button>
    </div>

    <div v-if="loading" class="font-sans text-sm text-zinc-400 py-16 text-center">Загрузка…</div>

    <div v-else-if="!apps.length" class="flex flex-col items-center gap-5 py-16">
      <p class="font-sans text-[0.9375rem] text-zinc-400">У вас пока нет приложений</p>
      <Button variant="primary" @click="navigateTo('/my/apps/new')">
        <template #left><Icon name="plus" :size="18" /></template>
        Создать первое
      </Button>
    </div>

    <template v-else>
      <div class="flex flex-col gap-4 mb-7">
        <AppRow
          v-for="app in apps"
          :key="app.id"
          :name="app.name"
          :description="app.description"
          :meta="metaOf(app)"
          :status="app.published ? 'Опубликован' : null"
          :stats="statsOf(app)"
          @click="navigateTo(`/my/apps/${app.id}`)"
        />
      </div>

      <div v-if="totalPages > 1" class="flex items-center justify-between">
        <span class="font-sans text-sm text-zinc-400">{{ rangeLabel }}</span>
        <Pagination v-model:page="page" :page-count="totalPages" @change="fetchApps" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { App } from "@fuse/shared";

const { $api } = useNuxtApp() as any;

const apps = ref<App[]>([]);
const loading = ref(true);
const page = ref(1);
const limit = 10;
const total = ref(0);
const totalPages = ref(1);

const rangeLabel = computed(() => {
  const start = (page.value - 1) * limit + 1;
  return `${start}–${start + apps.value.length - 1} из ${total.value}`;
});

function metaOf(app: App): string {
  return [app.host, app.apiVersion && `v${app.apiVersion}`].filter(Boolean).join(" · ");
}

function statsOf(app: App & { scenarioCount?: number }) {
  return [
    { value: app.endpoints?.length ?? 0, label: "endpoints" },
    { value: app.scenarioCount ?? 0, label: "сценариев" },
  ];
}

async function fetchApps() {
  loading.value = true;
  try {
    const { data } = await $api.GET("/api/apps", {
      params: { query: { page: page.value, limit } },
    });
    apps.value = data?.data ?? [];
    total.value = data?.total ?? apps.value.length;
    totalPages.value = data?.totalPages ?? 1;
  } catch {
    apps.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(fetchApps);
</script>
