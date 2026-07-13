<template>
  <div class="max-w-[940px] mx-auto px-5 lg:px-8 pt-8 pb-20 flex flex-col gap-6">
    <NuxtLink
      :to="`/my/apps/${appId}`"
      class="font-sans text-sm text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-700"
    >
      ‹ Назад к приложению
    </NuxtLink>

    <div v-if="loading" class="font-sans text-sm text-zinc-400 py-16 text-center">Загрузка…</div>

    <template v-else-if="app">
      <div class="flex items-start gap-[18px] flex-wrap">
        <ProviderIcon :name="app.name" :size="48" />
        <div class="flex-1 min-w-[200px]">
          <h1 class="font-sans font-extrabold text-[1.875rem] tracking-tight text-zinc-900">
            {{ app.name }}
          </h1>
          <div class="font-mono text-[0.8125rem] text-zinc-400 mt-1.5">{{ metaLine }}</div>
        </div>
        <Badge v-if="app.published" tone="success" dot>Опубликован</Badge>
        <Badge v-else tone="neutral">Скрыт</Badge>
      </div>

      <Card padding="xl" class="flex flex-col gap-5">
        <div>
          <h2 class="font-sans font-bold text-[1.0625rem] tracking-tight text-zinc-900 mb-1.5">
            Проверить обновления
          </h2>
          <p class="font-sans text-sm text-zinc-500">
            Мы заново разберём спецификацию и покажем, что изменилось, — прежде чем сохранять.
          </p>
        </div>

        <form v-if="app.openapiUrl" class="flex flex-col gap-5" @submit.prevent="checkUpdates">
          <Input
            v-model="openapiUrl"
            label="OpenAPI URL"
            type="url"
            mono
            placeholder="https://api.example.com/openapi.json"
          />

          <p
            v-if="reimportError"
            class="font-sans text-[0.8125rem] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5"
          >
            {{ reimportError }}
          </p>

          <p
            v-if="successMessage"
            class="font-sans text-[0.8125rem] text-green-700 bg-green-50 border border-green-200 rounded-xl px-3.5 py-2.5"
          >
            {{ successMessage }}
          </p>

          <div>
            <Button variant="dark" type="submit" :disabled="checking">
              <template #left><Icon name="refresh-cw" :size="16" /></template>
              {{ checking ? "Проверка…" : "Проверить обновления" }}
            </Button>
          </div>
        </form>

        <p v-else class="font-sans text-sm text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3">
          Спецификация загружена файлом — повторный импорт файлом скоро.
        </p>
      </Card>

      <template v-if="diff">
        <div v-if="!hasChanges" class="font-sans text-sm text-zinc-400 py-12 text-center">
          Изменений не обнаружено
        </div>

        <template v-else>
          <section v-if="diff.added.length" class="flex flex-col gap-3">
            <div class="flex items-baseline gap-3">
              <h3 class="font-sans font-bold text-[1.0625rem] tracking-tight text-zinc-900">
                Новые endpoints
              </h3>
              <span class="font-mono text-[0.8125rem] text-zinc-400">
                {{ diff.added.length }} шт.
              </span>
            </div>
            <Card padding="sm">
              <EndpointRow
                v-for="(ep, i) in diff.added"
                :key="`a-${i}`"
                :method="ep.method"
                :path="ep.path"
              >
                <template #right>
                  <span class="inline-flex items-center gap-2.5">
                    <span class="text-zinc-500">{{ ep.summary }}</span>
                    <Badge tone="success" size="sm">новый</Badge>
                  </span>
                </template>
              </EndpointRow>
            </Card>
          </section>

          <section v-if="diff.deprecated.length" class="flex flex-col gap-3">
            <div class="flex items-baseline gap-3">
              <h3 class="font-sans font-bold text-[1.0625rem] tracking-tight text-zinc-900">
                Удалённые endpoints
              </h3>
              <span class="font-mono text-[0.8125rem] text-zinc-400">
                {{ diff.deprecated.length }} шт.
              </span>
            </div>
            <Card padding="sm">
              <div v-for="(ep, i) in diff.deprecated" :key="`d-${i}`" class="opacity-60">
                <EndpointRow :method="ep.method" :path="ep.path">
                  <template #right>
                    <span class="inline-flex items-center gap-2.5">
                      <span class="text-zinc-500">{{ ep.summary }}</span>
                      <Badge tone="brand" size="sm">удалён</Badge>
                    </span>
                  </template>
                </EndpointRow>
              </div>
            </Card>
          </section>

          <section v-if="diff.kept.length" class="flex flex-col gap-3">
            <div class="flex items-baseline gap-3">
              <h3 class="font-sans font-bold text-[1.0625rem] tracking-tight text-zinc-900">
                Без изменений
              </h3>
              <span class="font-mono text-[0.8125rem] text-zinc-400">
                {{ diff.kept.length }} шт.
              </span>
            </div>
            <Card padding="sm">
              <EndpointRow
                v-for="(ep, i) in diff.kept"
                :key="`k-${i}`"
                :method="ep.method"
                :path="ep.path"
                :description="ep.summary"
              />
            </Card>
          </section>

          <div>
            <Button variant="primary" :disabled="saving" @click="saveUpdate">
              {{ saving ? "Сохранение…" : "Сохранить обновление" }}
            </Button>
          </div>
        </template>
      </template>
    </template>

    <div v-else class="font-sans text-sm text-zinc-400 py-16 text-center">
      Приложение не найдено
    </div>
  </div>
</template>

<script setup lang="ts">
import type { App, ReimportDiff } from "@fuse/shared";

const route = useRoute();
const { $api } = useNuxtApp() as any;
const appId = route.params.id as string;

const app = ref<App | null>(null);
const loading = ref(true);
const openapiUrl = ref("");
const diff = ref<ReimportDiff | null>(null);
const checking = ref(false);
const saving = ref(false);
const reimportError = ref("");
const successMessage = ref("");

const metaLine = computed(() => {
  if (!app.value) return "";
  return [
    app.value.host,
    app.value.apiVersion && `v${app.value.apiVersion}`,
    `${app.value.endpoints?.length ?? 0} endpoints`,
  ]
    .filter(Boolean)
    .join(" · ");
});

const hasChanges = computed(
  () =>
    !!diff.value &&
    diff.value.added.length + diff.value.kept.length + diff.value.deprecated.length > 0,
);

async function fetchApp() {
  loading.value = true;
  try {
    const { data } = await $api.GET("/api/apps/{id}", {
      params: { path: { id: appId } },
    });
    app.value = data ?? null;
    openapiUrl.value = data?.openapiUrl ?? "";
  } catch {
    app.value = null;
  } finally {
    loading.value = false;
  }
}

async function checkUpdates() {
  checking.value = true;
  reimportError.value = "";
  successMessage.value = "";
  try {
    const { data, error } = await $api.POST("/api/apps/{id}/reimport", {
      params: { path: { id: appId } },
      body: { openapiUrl: openapiUrl.value },
    });
    if (error || !data) {
      reimportError.value = error?.message ?? "Не удалось проверить обновления";
      return;
    }
    diff.value = data;
  } catch {
    reimportError.value = "Не удалось проверить обновления. Проверьте URL.";
  } finally {
    checking.value = false;
  }
}

async function saveUpdate() {
  saving.value = true;
  reimportError.value = "";
  try {
    // Спека перечитывается по сохранённому URL, поэтому сначала фиксируем новый,
    // если пользователь его отредактировал.
    if (openapiUrl.value !== app.value?.openapiUrl) {
      const { error } = await $api.PATCH("/api/apps/{id}", {
        params: { path: { id: appId } },
        body: { openapiUrl: openapiUrl.value },
      });
      if (error) {
        reimportError.value = error?.message ?? "Не удалось сохранить ссылку на спецификацию";
        return;
      }
    }

    // Раньше здесь был только PATCH метаданных — endpoints и снапшот спеки в БД
    // не обновлялись НИКОГДА, а UI всё равно рапортовал об успехе.
    const { error } = await $api.POST("/api/apps/{id}/reimport/apply", {
      params: { path: { id: appId } },
    });
    if (error) {
      reimportError.value = error?.message ?? "Не удалось сохранить обновление";
      return;
    }

    successMessage.value = "Обновление успешно сохранено";
    diff.value = null;
    await fetchApp();
  } catch {
    reimportError.value = "Не удалось сохранить обновление";
  } finally {
    saving.value = false;
  }
}

onMounted(fetchApp);
</script>
