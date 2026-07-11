<template>
  <div class="max-w-[1180px] xl:max-w-[1320px] mx-auto px-5 lg:px-8 pt-8 pb-20">
    <div v-if="loading" class="font-sans text-sm text-zinc-400 py-16 text-center">Загрузка…</div>

    <template v-else-if="app">
      <NuxtLink
        to="/my/apps"
        class="font-sans text-sm text-zinc-500 inline-flex items-center gap-1.5 mb-6 hover:text-zinc-700"
      >
        ‹ Приложения
      </NuxtLink>

      <div class="flex items-start gap-[18px] mb-7 flex-wrap">
        <ProviderIcon :name="app.name" :size="64" />
        <div class="flex-1 min-w-[200px]">
          <h1
            class="font-sans font-extrabold text-[1.875rem] md:text-[2.5rem] tracking-tight text-zinc-900"
          >
            {{ app.name }}
          </h1>
          <p v-if="app.description" class="font-sans text-base text-zinc-500 mt-1.5 mb-2">
            {{ app.description }}
          </p>
          <div class="font-mono text-[0.8125rem] text-zinc-400">{{ metaLine }}</div>
        </div>
        <div class="flex items-center gap-2.5 shrink-0">
          <PublishButton
            :published="app.published"
            @publish="setPublished(true)"
            @unpublish="confirmOff = true"
          />
          <Button variant="danger" @click="confirmDelete = true">
            <template #left><Icon name="trash-2" :size="16" /></template>
            Удалить
          </Button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-10">
        <StatCard :value="app.endpoints?.length ?? 0" label="подключённых endpoints" />
        <StatCard :value="app.scenarioCount ?? 0" label="сценариев используют этот API" />
      </div>

      <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 mb-4">
        <div class="flex items-baseline gap-3">
          <h2 class="font-sans font-bold text-[1.375rem] tracking-tight text-zinc-900">
            Импортированные endpoints
          </h2>
          <span class="font-mono text-[0.8125rem] text-zinc-400">
            {{ app.endpoints?.length ?? 0 }} шт.
          </span>
        </div>
        <Button variant="dark" @click="navigateTo(`/my/apps/${appId}/update`)">
          <template #left><Icon name="refresh-cw" :size="16" /></template>
          Обновить API
        </Button>
      </div>

      <Card v-if="pageItems.length" padding="sm">
        <EndpointRow
          v-for="ep in pageItems"
          :key="ep.id"
          :method="ep.method"
          :path="ep.path"
          :description="ep.summary"
        />
      </Card>
      <Card v-else padding="lg">
        <p class="font-sans text-sm text-zinc-400 text-center py-6">
          Endpoints ещё не импортированы
        </p>
      </Card>

      <div v-if="epPageCount > 1" class="flex items-center justify-between mt-5">
        <span class="font-sans text-sm text-zinc-400">{{ rangeLabel }}</span>
        <Pagination v-model:page="epPage" :page-count="epPageCount" />
      </div>

      <Modal
        v-if="confirmOff"
        title="Снять с публикации?"
        :subtitle="`«${app.name}» перестанет быть доступным в маркетплейсе.`"
        :width="460"
        @close="confirmOff = false"
      >
        <p class="font-sans text-[0.9375rem] text-zinc-600 leading-normal">
          Сценарии, использующие его endpoints, приостановятся. Вы сможете снова опубликовать
          приложение в любой момент — endpoints и настройки сохранятся.
        </p>
        <template #footer>
          <Button variant="ghost" @click="confirmOff = false">Отмена</Button>
          <Button variant="danger" @click="unpublish">Снять с публикации</Button>
        </template>
      </Modal>

      <Modal
        v-if="confirmDelete"
        title="Удалить приложение?"
        :subtitle="`«${app.name}» будет удалено безвозвратно.`"
        :width="460"
        @close="confirmDelete = false"
      >
        <p class="font-sans text-[0.9375rem] text-zinc-600 leading-normal">
          Вместе с приложением удалятся все импортированные endpoints. Сценарии, которые их
          используют, перестанут работать.
        </p>
        <template #footer>
          <Button variant="ghost" @click="confirmDelete = false">Отмена</Button>
          <Button variant="danger" @click="deleteApp">Удалить</Button>
        </template>
      </Modal>
    </template>

    <div v-else class="font-sans text-sm text-zinc-400 py-16 text-center">
      Приложение не найдено
    </div>
  </div>
</template>

<script setup lang="ts">
import type { App } from "@fuse/shared";

const route = useRoute();
const { $api } = useNuxtApp() as any;
const appId = route.params.id as string;

const EP_PAGE_SIZE = 8;

const app = ref<(App & { scenarioCount?: number }) | null>(null);
const loading = ref(true);
const confirmOff = ref(false);
const confirmDelete = ref(false);
const epPage = ref(1);

const endpoints = computed(() => app.value?.endpoints ?? []);
const epPageCount = computed(() => Math.max(1, Math.ceil(endpoints.value.length / EP_PAGE_SIZE)));
const epStart = computed(() => (epPage.value - 1) * EP_PAGE_SIZE);
const pageItems = computed(() =>
  endpoints.value.slice(epStart.value, epStart.value + EP_PAGE_SIZE),
);

const rangeLabel = computed(
  () =>
    `${epStart.value + 1}–${epStart.value + pageItems.value.length} из ${endpoints.value.length}`,
);

const metaLine = computed(() => {
  if (!app.value) return "";
  const parts = [app.value.host, app.value.apiVersion && `v${app.value.apiVersion}`].filter(Boolean);
  const synced = app.value.syncedAt ? `синхр. ${formatDate(app.value.syncedAt)}` : null;
  return [...parts, synced].filter(Boolean).join(" · ");
});

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function fetchApp() {
  loading.value = true;
  try {
    const { data } = await $api.GET("/api/apps/{id}", {
      params: { path: { id: appId } },
    });
    app.value = data ?? null;
  } catch {
    app.value = null;
  } finally {
    loading.value = false;
  }
}

async function setPublished(published: boolean) {
  if (!app.value) return;
  try {
    await $api.PATCH("/api/apps/{id}/publish", {
      params: { path: { id: appId } },
      body: { published },
    });
    app.value.published = published;
  } catch {
    // keep the previous state on failure
  }
}

async function unpublish() {
  confirmOff.value = false;
  await setPublished(false);
}

async function deleteApp() {
  try {
    await $api.DELETE("/api/apps/{id}", {
      params: { path: { id: appId } },
    });
    await navigateTo("/my/apps");
  } catch {
    confirmDelete.value = false;
  }
}

onMounted(fetchApp);
</script>
