<template>
  <div class="max-w-[1180px] xl:max-w-[1320px] mx-auto px-5 lg:px-8 pt-8 lg:pt-12 pb-20">
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6 mb-9">
      <div class="max-w-[560px]">
        <h1
          class="font-sans font-extrabold text-[2rem] md:text-[2.75rem] leading-tight tracking-tight text-zinc-900 mb-3"
        >
          Мои сценарии
        </h1>
        <p class="font-sans text-base text-zinc-500 leading-normal">
          Use-case карточки — самостоятельные сущности. Один сценарий может собирать шаги из разных
          API.
        </p>
      </div>
      <Button variant="primary" @click="creating = true">
        <template #left><Icon name="plus" :size="18" /></template>
        Создать сценарий
      </Button>
    </div>

    <div v-if="loading" class="font-sans text-sm text-zinc-400 py-16 text-center">Загрузка…</div>

    <div v-else-if="!scenarios.length" class="flex flex-col items-center gap-5 py-16">
      <p class="font-sans text-[0.9375rem] text-zinc-400">Нет созданных сценариев</p>
      <Button variant="primary" @click="creating = true">
        <template #left><Icon name="plus" :size="18" /></template>
        Создать первый
      </Button>
    </div>

    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ScenarioCard
          v-for="(s, i) in scenarios"
          :key="s.id"
          :cover="coverFor(s, i)"
          :title="s.title"
          :description="s.tagline"
          :meta="`${s.steps?.length ?? 0} шагов · ${s.runCount ?? 0} запусков`"
          @click="openEditor(s.id)"
        >
          <template #status>
            <Badge v-if="s.published" tone="success" dot>Опубликован</Badge>
            <Badge v-else tone="neutral">Черновик</Badge>
          </template>
          <template #actions>
            <Button variant="secondary" size="sm" full-width @click.stop="openEditor(s.id)">
              Редактировать
            </Button>
          </template>
        </ScenarioCard>
      </div>

      <div v-if="totalPages > 1" class="flex items-center justify-between mt-9">
        <span class="font-sans text-sm text-zinc-400">{{ rangeLabel }}</span>
        <Pagination v-model:page="page" :page-count="totalPages" @change="loadScenarios" />
      </div>
    </template>

    <!-- Name it, then jump straight into the editor (category/description live there) -->
    <Modal
      v-if="creating"
      title="Новый сценарий"
      subtitle="Дайте сценарию название — остальное настроите в редакторе."
      :width="520"
      @close="closeCreate"
    >
      <div class="pb-2">
        <Input
          v-model="newTitle"
          label="Название сценария"
          placeholder="Например: Проверка контрагента"
          @keydown.enter="create"
        />
        <p v-if="createError" class="font-sans text-[0.8125rem] text-rose-600 mt-2.5">
          {{ createError }}
        </p>
      </div>
      <template #footer>
        <Button variant="ghost" :disabled="submitting" @click="closeCreate">Отмена</Button>
        <Button variant="dark" :disabled="!canCreate || submitting" @click="create">
          {{ submitting ? "Создание…" : "Создать и открыть" }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import type { Scenario } from "@fuse/shared";

const { $api } = useNuxtApp() as any;

const LIMIT = 10;

const scenarios = ref<Scenario[]>([]);
const loading = ref(true);
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);

const creating = ref(false);
const newTitle = ref("");
const submitting = ref(false);
const createError = ref("");

const canCreate = computed(() => !!newTitle.value.trim());

const rangeLabel = computed(() => {
  const start = (page.value - 1) * LIMIT + 1;
  return `${start}–${start + scenarios.value.length - 1} из ${total.value}`;
});

function coverFor(s: Scenario, i: number): { src?: string; variant?: "striped" | "mint" } {
  if (s.coverUrl) return { src: s.coverUrl };
  return { variant: i % 2 === 0 ? "striped" : "mint" };
}

function openEditor(id: string) {
  navigateTo(`/my/scenarios/${id}/edit`);
}

async function loadScenarios() {
  loading.value = true;
  try {
    const { data } = await $api.GET("/api/scenarios", {
      params: { query: { page: page.value, limit: LIMIT } },
    });
    scenarios.value = data?.data ?? [];
    total.value = data?.total ?? scenarios.value.length;
    totalPages.value = data?.totalPages ?? 1;
  } finally {
    loading.value = false;
  }
}

function closeCreate() {
  creating.value = false;
  newTitle.value = "";
  createError.value = "";
}

async function create() {
  if (!canCreate.value || submitting.value) return;
  submitting.value = true;
  createError.value = "";
  try {
    const { data, error } = await $api.POST("/api/scenarios", {
      body: { title: newTitle.value.trim() },
    });
    if (error || !data) {
      createError.value = "Не удалось создать сценарий";
      return;
    }
    await navigateTo(`/my/scenarios/${data.id}/edit`);
  } catch {
    createError.value = "Не удалось создать сценарий";
  } finally {
    submitting.value = false;
  }
}

onMounted(loadScenarios);
</script>
