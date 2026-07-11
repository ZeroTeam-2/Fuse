<template>
  <div class="max-w-[980px] xl:max-w-[1080px] mx-auto px-5 lg:px-8 pt-8 lg:pt-12 pb-20">
    <h1
      class="font-sans font-extrabold text-[2rem] md:text-[2.75rem] leading-tight tracking-tight text-zinc-900 mb-2"
    >
      Профиль
    </h1>
    <p class="font-sans text-base text-zinc-500 mb-7">
      Данные аккаунта и всё, что вы опубликовали на Fuse.
    </p>

    <!-- Аватар -->
    <Card padding="lg" class="flex flex-col sm:flex-row sm:items-center gap-5 mb-5">
      <Avatar :name="fullName" :src="avatarPreview || user?.avatarUrl" :size="80" />
      <div class="flex-1 min-w-0">
        <h2 class="font-sans font-bold text-[1.375rem] tracking-tight text-zinc-900 mb-0.5 truncate">
          {{ fullName || "Без имени" }}
        </h2>
        <div class="font-sans text-[0.9375rem] text-zinc-500 truncate">{{ user?.email }}</div>
      </div>
      <label
        class="inline-flex items-center justify-center px-5 py-3 rounded-xl font-sans font-bold text-[0.9375rem] leading-none whitespace-nowrap bg-white text-zinc-900 border border-zinc-200 shadow-sm cursor-pointer transition hover:bg-zinc-100"
      >
        <input type="file" accept="image/*" class="hidden" @change="onAvatarChange" />
        {{ uploadingAvatar ? "Загрузка…" : "Загрузить фото" }}
      </label>
      <Button v-if="user?.avatarUrl" variant="ghost" @click="removeAvatar">Удалить</Button>
    </Card>

    <!-- Личные данные -->
    <Card padding="lg" class="mb-5">
      <h3 class="font-sans font-bold text-[1.0625rem] tracking-tight text-zinc-900 mb-1">
        Личные данные
      </h3>
      <p class="font-sans text-sm text-zinc-500 mb-5">
        Эти данные видите только вы и владельцы API, чьи сценарии вы запускаете.
      </p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-5">
        <Input v-model="form.firstName" label="Имя" placeholder="Имя" />
        <Input v-model="form.lastName" label="Фамилия" placeholder="Фамилия" />
        <Input v-model="form.email" label="Email" type="email" placeholder="you@example.com" />
      </div>
      <p
        v-if="error"
        class="font-sans text-[0.8125rem] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 mb-4"
      >
        {{ error }}
      </p>
      <div class="flex items-center justify-end gap-3">
        <span v-if="saved" class="font-sans text-[0.8125rem] text-emerald-600">Сохранено</span>
        <Button variant="dark" :disabled="!dirty || saving" @click="saveProfile">
          {{ saving ? "Сохранение…" : "Сохранить изменения" }}
        </Button>
      </div>
    </Card>

    <!-- Вход -->
    <Card padding="lg" class="flex flex-col sm:flex-row sm:items-center gap-4 mb-10">
      <div class="flex-1">
        <h3 class="font-sans font-bold text-[1.0625rem] tracking-tight text-zinc-900 mb-1">
          Вход в аккаунт
        </h3>
        <p class="font-sans text-sm text-zinc-500">
          {{ user?.yandexId ? "Вы входите через Яндекс ID" : "Аккаунт создан по email" }}
        </p>
      </div>
      <Button variant="secondary" @click="logout">Выйти</Button>
    </Card>

    <!-- Мои API -->
    <div class="flex items-baseline justify-between mb-4">
      <h2 class="font-sans font-bold text-[1.375rem] tracking-tight text-zinc-900">
        Мои API <span class="text-zinc-400">{{ appsTotal }}</span>
      </h2>
      <NuxtLink to="/my/apps" class="font-sans text-sm font-bold text-rose-600 hover:text-rose-700">
        Управлять →
      </NuxtLink>
    </div>
    <div
      v-if="!apps.length"
      class="border border-dashed border-zinc-300 rounded-2xl px-6 py-10 text-center font-sans text-[0.9375rem] text-zinc-500 mb-11"
    >
      Пока ни одного подключённого API.
    </div>
    <template v-else>
      <div class="flex flex-col gap-3.5 mb-3.5">
        <AppRow
          v-for="app in apps"
          :key="app.id"
          :name="app.name"
          :description="app.description"
          :meta="app.host"
          :status="app.published ? 'Опубликован' : null"
          :stats="[{ value: app.endpoints?.length ?? 0, label: 'endpoints' }]"
          @click="navigateTo(`/my/apps/${app.id}`)"
        />
      </div>
      <div class="flex items-center justify-between mb-11">
        <span class="font-sans text-sm text-zinc-400">{{ appsRange }}</span>
        <Pagination
          v-if="appsPageCount > 1"
          v-model:page="appsPage"
          :page-count="appsPageCount"
          @change="loadApps"
        />
      </div>
    </template>

    <!-- Мои сценарии -->
    <div class="flex items-baseline justify-between mb-4">
      <h2 class="font-sans font-bold text-[1.375rem] tracking-tight text-zinc-900">
        Мои сценарии <span class="text-zinc-400">{{ scenariosTotal }}</span>
      </h2>
      <NuxtLink
        to="/my/scenarios"
        class="font-sans text-sm font-bold text-rose-600 hover:text-rose-700"
      >
        Все сценарии →
      </NuxtLink>
    </div>
    <div
      v-if="!scenarios.length"
      class="border border-dashed border-zinc-300 rounded-2xl px-6 py-10 text-center font-sans text-[0.9375rem] text-zinc-500"
    >
      Пока ни одного сценария.
    </div>
    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5 mb-3.5">
        <NuxtLink v-for="s in scenarios" :key="s.id" :to="`/my/scenarios/${s.id}/edit`">
          <Card padding="lg" interactive class="h-full">
            <div class="flex items-center justify-between gap-3 mb-1.5">
              <Badge :tone="s.published ? 'success' : 'neutral'" dot>
                {{ s.published ? "Опубликован" : "Черновик" }}
              </Badge>
              <span class="font-sans text-[0.8125rem] text-zinc-400">
                {{ s.steps?.length ?? 0 }} шагов
              </span>
            </div>
            <h3 class="font-sans font-bold text-[1.0625rem] tracking-tight text-zinc-900 mb-1.5">
              {{ s.title }}
            </h3>
            <p class="font-sans text-sm text-zinc-500 leading-normal line-clamp-2">
              {{ s.description || "Без описания" }}
            </p>
          </Card>
        </NuxtLink>
      </div>
      <div class="flex items-center justify-between">
        <span class="font-sans text-sm text-zinc-400">{{ scenariosRange }}</span>
        <Pagination
          v-if="scenariosPageCount > 1"
          v-model:page="scenariosPage"
          :page-count="scenariosPageCount"
          @change="loadScenarios"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { App, Scenario } from "@fuse/shared";

const { $api } = useNuxtApp() as any;
const authStore = useAuthStore();

const APPS_LIMIT = 3;
const SCENARIOS_LIMIT = 4;

const user = computed(() => authStore.user);

const form = reactive({ firstName: "", lastName: "", email: "" });
const saving = ref(false);
const saved = ref(false);
const error = ref("");
const uploadingAvatar = ref(false);
const avatarPreview = ref<string | null>(null);

const apps = ref<App[]>([]);
const appsTotal = ref(0);
const appsPage = ref(1);

const scenarios = ref<Scenario[]>([]);
const scenariosTotal = ref(0);
const scenariosPage = ref(1);

const fullName = computed(() =>
  [user.value?.firstName, user.value?.lastName].filter(Boolean).join(" "),
);

const dirty = computed(
  () =>
    !!user.value &&
    (form.firstName !== (user.value.firstName ?? "") ||
      form.lastName !== (user.value.lastName ?? "") ||
      form.email !== (user.value.email ?? "")),
);

const appsPageCount = computed(() => Math.max(1, Math.ceil(appsTotal.value / APPS_LIMIT)));
const scenariosPageCount = computed(() =>
  Math.max(1, Math.ceil(scenariosTotal.value / SCENARIOS_LIMIT)),
);

function range(page: number, limit: number, count: number, total: number) {
  const start = (page - 1) * limit + 1;
  return `${start}–${Math.min(start + count - 1, total)} из ${total}`;
}
const appsRange = computed(() => range(appsPage.value, APPS_LIMIT, apps.value.length, appsTotal.value));
const scenariosRange = computed(() =>
  range(scenariosPage.value, SCENARIOS_LIMIT, scenarios.value.length, scenariosTotal.value),
);

function syncForm() {
  form.firstName = user.value?.firstName ?? "";
  form.lastName = user.value?.lastName ?? "";
  form.email = user.value?.email ?? "";
}

async function loadApps() {
  const { data } = await $api.GET("/api/apps", {
    params: { query: { page: appsPage.value, limit: APPS_LIMIT } },
  });
  if (data) {
    apps.value = data.data ?? [];
    appsTotal.value = data.total ?? 0;
  }
}

async function loadScenarios() {
  const { data } = await $api.GET("/api/scenarios", {
    params: { query: { page: scenariosPage.value, limit: SCENARIOS_LIMIT } },
  });
  if (data) {
    scenarios.value = data.data ?? [];
    scenariosTotal.value = data.total ?? 0;
  }
}

async function saveProfile() {
  if (!dirty.value) return;
  saving.value = true;
  error.value = "";
  saved.value = false;
  try {
    const { data, error: apiError } = await $api.PATCH("/api/users/me", { body: { ...form } });
    if (apiError || !data) {
      error.value = "Не удалось сохранить профиль";
      return;
    }
    await authStore.fetchUser();
    syncForm();
    saved.value = true;
  } finally {
    saving.value = false;
  }
}

// openapi-fetch cannot send multipart, so the avatar goes through plain fetch.
async function onAvatarChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  avatarPreview.value = URL.createObjectURL(file);
  uploadingAvatar.value = true;
  error.value = "";
  try {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`${useApiBase()}/api/users/me/avatar`, {
      method: "POST",
      credentials: "include",
      body,
    });
    if (!res.ok) throw new Error();
    await authStore.fetchUser();
  } catch {
    error.value = "Не удалось загрузить фото";
  } finally {
    avatarPreview.value = null;
    uploadingAvatar.value = false;
    input.value = "";
  }
}

async function removeAvatar() {
  const { error: apiError } = await $api.DELETE("/api/users/me/avatar", {});
  if (apiError) {
    error.value = "Не удалось удалить фото";
    return;
  }
  avatarPreview.value = null;
  await authStore.fetchUser();
}

async function logout() {
  await fetch(`${useApiBase()}/api/auth/logout`, { credentials: "include" });
  authStore.clearUser();
  await navigateTo("/login");
}

watch(user, syncForm, { immediate: true });
watch([() => form.firstName, () => form.lastName, () => form.email], () => {
  saved.value = false;
});

onMounted(() => {
  loadApps();
  loadScenarios();
});
</script>
