<template>
  <div class="scenarios-page">
    <div class="page-header">
      <h1 class="page-title">Мои сценарии</h1>
      <NuxtLink to="/my/scenarios/new" class="create-btn">Создать сценарий</NuxtLink>
    </div>

    <div v-if="loading" class="loading">Загрузка...</div>
    <div v-else-if="scenarios.length === 0" class="empty">
      Нет созданных сценариев. Создайте первый!
    </div>
    <div v-else class="scenario-list">
      <NuxtLink
        v-for="s in scenarios"
        :key="s.id"
        :to="`/my/scenarios/${s.id}/edit`"
        class="scenario-card"
      >
        <div class="card-header">
          <span class="card-title">{{ s.title }}</span>
          <span :class="['badge', s.published ? 'published' : 'draft']">
            {{ s.published ? "Опубликован" : "Черновик" }}
          </span>
        </div>
        <p v-if="s.tagline" class="card-tagline">{{ s.tagline }}</p>
        <div class="card-meta">
          <span>{{ s.steps?.length ?? 0 }} шагов</span>
          <span v-if="s.category">· {{ s.category }}</span>
          <span>· {{ s.runCount ?? 0 }} запусков</span>
        </div>
      </NuxtLink>
    </div>

    <div v-if="totalPages > 1" class="pagination">
      <button :disabled="page <= 1" @click="page--; loadScenarios()">←</button>
      <span>{{ page }} / {{ totalPages }}</span>
      <button :disabled="page >= totalPages" @click="page++; loadScenarios()">→</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const scenarios = ref<any[]>([]);
const loading = ref(true);
const page = ref(1);
const totalPages = ref(1);

async function loadScenarios() {
  loading.value = true;
  const { $api } = useNuxtApp() as any;
  try {
    const { data } = await $api.GET("/api/scenarios", { params: { query: { page: page.value, limit: 10 } } });
    if (data.value) {
      scenarios.value = data.value.data ?? [];
      totalPages.value = data.value.totalPages ?? 1;
    }
  } finally {
    loading.value = false;
  }
}

onMounted(loadScenarios);
</script>

<style scoped>
.scenarios-page { max-width: 900px; margin: 0 auto; padding: 32px 24px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.page-title { font-size: 24px; font-weight: 800; color: #18181b; margin: 0; }
.create-btn { padding: 8px 16px; border-radius: 8px; background: #6366f1; color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; }
.loading, .empty { text-align: center; padding: 48px; color: #71717a; font-size: 14px; }
.scenario-list { display: flex; flex-direction: column; gap: 12px; }
.scenario-card { display: block; padding: 16px; border: 1px solid #e4e4e7; border-radius: 10px; background: #fff; text-decoration: none; transition: border-color 0.15s; }
.scenario-card:hover { border-color: #c4c4c7; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.card-title { font-size: 15px; font-weight: 600; color: #18181b; }
.badge { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 100px; }
.badge.published { background: #dcfce7; color: #16a34a; }
.badge.draft { background: #f4f4f5; color: #71717a; }
.card-tagline { font-size: 13px; color: #71717a; margin: 0 0 8px; }
.card-meta { font-size: 12px; color: #a1a1aa; display: flex; gap: 4px; }
.pagination { display: flex; justify-content: center; align-items: center; gap: 16px; margin-top: 24px; }
.pagination button { padding: 6px 12px; border: 1px solid #e4e4e7; border-radius: 6px; background: #fff; cursor: pointer; color: #52525b; }
.pagination button:disabled { opacity: 0.4; cursor: default; }
</style>
