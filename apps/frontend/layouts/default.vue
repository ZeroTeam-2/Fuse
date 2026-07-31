<template>
  <div class="min-h-screen flex flex-col bg-zinc-50">
    <header
      class="sticky top-0 z-[100] flex items-center h-16 px-4 lg:px-8 bg-white border-b border-zinc-200"
    >
      <NuxtLink to="/" class="mr-10 shrink-0" aria-label="Fuse">
        <BrandMark :size="30" />
      </NuxtLink>

      <nav class="flex items-center gap-1.5">
        <NuxtLink
          v-for="item in visibleNavItems"
          :key="item.to"
          :to="item.to"
          class="font-sans font-semibold text-[0.9375rem] px-3.5 py-2 rounded-lg cursor-pointer transition-colors"
          :class="isActive(item) ? 'bg-rose-50 text-rose-600' : 'text-zinc-700 hover:bg-zinc-100'"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="ml-auto flex items-center gap-2 lg:gap-3">
        <NotificationsBell v-if="authStore.isAuthenticated" />
        <div v-if="authStore.user" ref="menuRef" class="relative">
          <button
            type="button"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            class="inline-flex items-center gap-2.5 border-0 bg-transparent p-0 cursor-pointer"
            @click="menuOpen = !menuOpen"
          >
            <span
              class="font-sans font-semibold text-[0.875rem] text-zinc-900 whitespace-nowrap hidden sm:block"
            >
              {{ fullName }}
            </span>
            <Avatar :name="fullName" :src="authStore.user.avatarUrl" :size="38" />
          </button>

          <div
            v-if="menuOpen"
            role="menu"
            class="absolute right-0 top-full mt-2 z-50 w-[220px] bg-white border border-zinc-200 rounded-2xl shadow-[0_24px_64px_rgba(24,24,27,0.18)] p-1.5"
          >
            <div class="px-2.5 py-2 border-b border-zinc-100 mb-1.5">
              <div class="font-sans text-sm font-bold text-zinc-900 truncate">{{ fullName }}</div>
              <div class="font-sans text-[0.78125rem] text-zinc-500 truncate">
                {{ authStore.user.email }}
              </div>
            </div>
            <NuxtLink
              to="/profile"
              role="menuitem"
              class="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl font-sans text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100"
              @click="menuOpen = false"
            >
              <Icon name="user" :size="16" />
              Профиль
            </NuxtLink>
            <button
              type="button"
              role="menuitem"
              class="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-xl font-sans text-sm font-semibold text-rose-600 cursor-pointer transition-colors hover:bg-rose-50"
              @click="logout"
            >
              <Icon name="log-out" :size="16" />
              Выйти
            </button>
          </div>
        </div>

        <Button v-else size="sm" @click="openLogin()">Войти</Button>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <LoginModal />
  </div>
</template>

<script setup lang="ts">
const authStore = useAuthStore();
const route = useRoute();

const { openLogin } = useLoginModal();

const navItems = [
  { to: "/", label: "Маркетплейс", exact: true, private: false },
  { to: "/my/scenarios", label: "Мои сценарии", private: true },
  { to: "/my/apps", label: "Мои API", private: true },
  { to: "/my/runs", label: "Запуски", private: true },
];

// Личные разделы гостю не показываем — вести ему туда некуда.
const visibleNavItems = computed(() =>
  navItems.filter((item) => !item.private || authStore.isAuthenticated),
);

function isActive(item: { to: string; exact?: boolean }) {
  return item.exact ? route.path === item.to : route.path.startsWith(item.to);
}

const fullName = computed(() => {
  const u = authStore.user;
  if (!u) return "";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || "?";
});

const menuOpen = ref(false);
const menuRef = ref<HTMLElement | null>(null);

function onDocMouseDown(e: MouseEvent) {
  if (menuOpen.value && !menuRef.value?.contains(e.target as Node)) menuOpen.value = false;
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") menuOpen.value = false;
}

async function logout() {
  menuOpen.value = false;
  await authStore.logout();
  await navigateTo("/");
}

watch(() => route.fullPath, () => (menuOpen.value = false));

onMounted(() => {
  document.addEventListener("mousedown", onDocMouseDown);
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocMouseDown);
  document.removeEventListener("keydown", onKey);
});
</script>
