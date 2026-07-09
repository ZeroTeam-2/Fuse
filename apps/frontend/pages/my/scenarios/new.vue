<template>
  <div class="new-scenario-page">
    <div class="form-card">
      <h1 class="page-title">Новый сценарий</h1>
      <form @submit.prevent="createScenario">
        <label class="field">
          <span class="label">Название</span>
          <input v-model="form.title" type="text" class="input" required placeholder="Например: Проверка контрагента" />
        </label>
        <label class="field">
          <span class="label">Описание</span>
          <textarea v-model="form.description" class="input textarea" rows="4" placeholder="Что делает этот сценарий?" />
        </label>
        <label class="field">
          <span class="label">Категория</span>
          <select v-model="form.category" class="input" @change="form.subcategory = ''">
            <option value="">Без категории</option>
            <option v-for="cat in categories" :key="cat.name" :value="cat.name">{{ cat.name }}</option>
          </select>
        </label>
        <label v-if="form.category && selectedCategory" class="field">
          <span class="label">Подкатегория</span>
          <select v-model="form.subcategory" class="input">
            <option value="">Все</option>
            <option v-for="sub in selectedCategory.subcategories" :key="sub" :value="sub">{{ sub }}</option>
          </select>
        </label>
        <div v-if="error" class="error">{{ error }}</div>
        <button type="submit" class="submit-btn" :disabled="creating">
          {{ creating ? "Создание..." : "Создать сценарий" }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CATEGORIES } from "@fuse/shared";

const categories = CATEGORIES;
const form = reactive({ title: "", description: "", category: "", subcategory: "" });
const creating = ref(false);
const error = ref("");

const selectedCategory = computed(() =>
  form.category ? CATEGORIES.find((c) => c.name === form.category) : null,
);

async function createScenario() {
  creating.value = true;
  error.value = "";
  const { $api } = useNuxtApp() as any;
  try {
    const { data, error: apiError } = await $api.POST("/api/scenarios", { body: form });
    if (apiError.value) {
      error.value = "Не удалось создать сценарий";
      return;
    }
    await navigateTo(`/my/scenarios/${data.value.id}/edit`);
  } catch {
    error.value = "Произошла ошибка";
  } finally {
    creating.value = false;
  }
}
</script>

<style scoped>
.new-scenario-page { max-width: 600px; margin: 0 auto; padding: 32px 24px; }
.form-card { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 28px; }
.page-title { font-size: 22px; font-weight: 800; color: #18181b; margin: 0 0 20px; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.label { font-size: 13px; font-weight: 500; color: #52525b; }
.input { padding: 10px 12px; border: 1px solid #e4e4e7; border-radius: 8px; font-size: 14px; color: #18181b; background: #fff; }
.textarea { resize: vertical; }
.error { color: #e11d48; font-size: 13px; margin-bottom: 12px; }
.submit-btn { width: 100%; padding: 12px; border-radius: 8px; border: none; background: #6366f1; color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; }
.submit-btn:disabled { opacity: 0.5; }
</style>
