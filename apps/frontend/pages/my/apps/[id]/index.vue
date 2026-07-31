<template>
  <div class="max-w-[1180px] xl:max-w-[1320px] mx-auto px-5 lg:px-8 pt-8 pb-20">
    <div
      v-if="loading"
      class="font-sans text-sm text-zinc-400 py-16 text-center"
    >
      Загрузка…
    </div>

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
          <p
            v-if="app.description"
            class="font-sans text-base text-zinc-500 mt-1.5 mb-2"
          >
            {{ app.description }}
          </p>
          <div class="font-mono text-[0.8125rem] text-zinc-400">
            {{ metaLine }}
          </div>
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
        <StatCard
          :value="app.endpoints?.length ?? 0"
          label="подключённых endpoints"
        />
        <StatCard
          :value="app.scenarioCount ?? 0"
          label="сценариев используют этот API"
        />
      </div>

      <!-- Environments -->
      <div
        class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 mb-4"
      >
        <div class="flex items-baseline gap-3">
          <h2
            class="font-sans font-bold text-[1.375rem] tracking-tight text-zinc-900"
          >
            Окружения
          </h2>
          <span class="font-mono text-[0.8125rem] text-zinc-400"
            >{{ environments.length }} шт.</span
          >
        </div>
        <Button variant="dark" @click="showEnvManager = true">
          <template #left><Icon name="layers" :size="16" /></template>
          Управление окружениями
        </Button>
      </div>

      <Card padding="sm" class="mb-12">
        <div
          v-for="env in environments"
          :key="env.id || env.name"
          class="flex items-center gap-3 px-4 py-3"
        >
          <span
            class="w-7 h-7 rounded-lg inline-flex items-center justify-center font-mono text-[0.6875rem] font-bold text-white shrink-0"
            :style="{ background: '#6366f1' }"
          >
            {{ env.name.slice(0, 2).toLowerCase() }}
          </span>
          <span
            class="font-sans text-[0.9375rem] font-semibold text-zinc-900 shrink-0"
            >{{ env.name }}</span
          >
          <Badge v-if="env.name === 'Prod'" tone="neutral" size="sm"
            >по умолчанию</Badge
          >
          <code
            class="ml-auto min-w-0 truncate font-mono text-[0.8125rem] text-zinc-400"
            :title="envBaseUrl(env)"
            >{{ envBaseUrl(env) || "— Base URL не задан" }}</code
          >
        </div>
      </Card>

      <EnvironmentManager
        v-if="showEnvManager"
        :app-id="appId"
        :environments="app?.environments ?? []"
        :fallback-base-url="app?.baseUrl"
        @updated="onEnvUpdated"
        @close="showEnvManager = false"
      />

      <div
        class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3 mb-4"
      >
        <div class="flex items-baseline gap-3">
          <h2
            class="font-sans font-bold text-[1.375rem] tracking-tight text-zinc-900"
          >
            Endpoints
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

      <EndpointBrowser :endpoints="endpoints" :page-size="25" />

      <Modal
        v-if="confirmOff"
        title="Снять с публикации?"
        :subtitle="`«${app.name}» перестанет быть доступным в маркетплейсе.`"
        :width="460"
        @close="confirmOff = false"
      >
        <p class="font-sans text-[0.9375rem] text-zinc-600 leading-normal">
          Сценарии, использующие его endpoints, приостановятся. Вы сможете снова
          опубликовать приложение в любой момент — endpoints и настройки
          сохранятся.
        </p>
        <template #footer>
          <Button variant="ghost" @click="confirmOff = false">Отмена</Button>
          <Button variant="danger" @click="unpublish"
            >Снять с публикации</Button
          >
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
          Вместе с приложением удалятся все импортированные endpoints. Сценарии,
          которые их используют, перестанут работать.
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

import type { Environment } from "@fuse/shared";

const route = useRoute();
const { $api } = useNuxtApp() as any;
const appId = route.params.id as string;

const app = ref<(App & { scenarioCount?: number }) | null>(null);
const loading = ref(true);
const confirmOff = ref(false);
const confirmDelete = ref(false);

const showEnvManager = ref(false);

const endpoints = computed(() => app.value?.endpoints ?? []);

// Legacy apps без окружений (не открывавшиеся владельцем) — показываем Prod из
// baseUrl; бэкенд заведёт настоящий Prod при следующем GET владельцем.
const environments = computed<Environment[]>(() => {
  const envs = app.value?.environments ?? [];
  if (envs.length) return envs;
  return [
    {
      id: "",
      name: "Prod",
      variables: [{ key: "baseUrl", value: app.value?.baseUrl ?? "" }],
    },
  ];
});

function envBaseUrl(env: Environment): string {
  return env.variables.find((v) => v.key === "baseUrl")?.value ?? "";
}

function onEnvUpdated(updated: App) {
  app.value = { ...(app.value ?? {}), ...updated };
}

const metaLine = computed(() => {
  if (!app.value) return "";
  const parts = [
    app.value.host,
    app.value.apiVersion && `v${app.value.apiVersion}`,
  ].filter(Boolean);
  const synced = app.value.syncedAt
    ? `синхр. ${formatDate(app.value.syncedAt)}`
    : null;
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
