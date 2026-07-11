<template>
  <div class="max-w-[640px] mx-auto px-5 lg:px-8 pt-8 pb-20 flex flex-col gap-6">
    <NuxtLink
      to="/my/scenarios"
      class="font-sans text-sm text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-700"
    >
      ‹ Мои сценарии
    </NuxtLink>

    <Card padding="xl" class="flex flex-col gap-6">
      <div>
        <h1 class="font-sans font-extrabold text-[1.875rem] tracking-tight text-zinc-900">
          Новый сценарий
        </h1>
        <p class="font-sans text-[0.9375rem] text-zinc-500 mt-1.5">
          Опишите сценарий — шаги соберёте в редакторе.
        </p>
      </div>

      <form class="flex flex-col gap-5" @submit.prevent="createScenario">
        <Input v-model="form.title" label="Название" placeholder="Например: Проверка контрагента" />

        <div class="flex flex-col gap-2">
          <label
            for="scenario-description"
            class="text-[0.8125rem] font-sans font-semibold text-zinc-900"
          >
            Описание
          </label>
          <textarea
            id="scenario-description"
            v-model="form.description"
            rows="4"
            placeholder="Что делает этот сценарий?"
            class="w-full px-3.5 py-3 font-sans text-[0.9375rem] text-zinc-900 bg-white border border-zinc-200 rounded-xl outline-none transition resize-y placeholder:text-zinc-400 focus:border-rose-600 focus:ring-4 focus:ring-rose-600/20"
          />
        </div>

        <Select
          v-model="form.category"
          label="Категория"
          placeholder="Без категории"
          searchable
          search-placeholder="Найти категорию…"
          :options="categoryOptions"
          @update:model-value="form.subcategory = ''"
        />

        <Select
          v-if="subcategoryOptions.length"
          v-model="form.subcategory"
          label="Подкатегория"
          placeholder="Все"
          :options="subcategoryOptions"
        />

        <p
          v-if="error"
          class="font-sans text-[0.8125rem] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5"
        >
          {{ error }}
        </p>

        <div>
          <Button variant="primary" type="submit" :disabled="!canCreate || creating">
            {{ creating ? "Создание…" : "Создать сценарий" }}
            <template #right><Icon name="arrow-right" :size="18" /></template>
          </Button>
        </div>
      </form>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { CATEGORIES } from "@fuse/shared";

const { $api } = useNuxtApp() as any;

const form = reactive({ title: "", description: "", category: "", subcategory: "" });
const creating = ref(false);
const error = ref("");

const canCreate = computed(() => !!form.title.trim());

const categoryOptions = computed(() => CATEGORIES.map((c) => c.name));

const subcategoryOptions = computed(
  () => CATEGORIES.find((c) => c.name === form.category)?.subcategories ?? [],
);

async function createScenario() {
  if (!canCreate.value) return;
  creating.value = true;
  error.value = "";
  try {
    const { data, error: apiError } = await $api.POST("/api/scenarios", { body: { ...form } });
    if (apiError || !data) {
      error.value = "Не удалось создать сценарий";
      return;
    }
    await navigateTo(`/my/scenarios/${data.id}/edit`);
  } catch {
    error.value = "Произошла ошибка";
  } finally {
    creating.value = false;
  }
}
</script>
