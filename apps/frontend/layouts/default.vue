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
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="font-sans font-semibold text-[0.9375rem] px-3.5 py-2 rounded-lg cursor-pointer transition-colors"
          :class="isActive(item) ? 'bg-rose-50 text-rose-600' : 'text-zinc-700 hover:bg-zinc-100'"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="ml-auto flex items-center">
        <template v-if="authStore.user">
          <NuxtLink to="/profile" class="inline-flex items-center gap-2.5" aria-label="Профиль">
            <span class="font-sans font-semibold text-[0.875rem] text-zinc-900 whitespace-nowrap hidden sm:block">
              {{ fullName }}
            </span>
            <Avatar :name="fullName" :src="authStore.user.avatarUrl" :size="38" />
          </NuxtLink>
        </template>
        <NuxtLink v-else to="/login">
          <Button size="sm">Войти</Button>
        </NuxtLink>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const authStore = useAuthStore();
const route = useRoute();

const navItems = [
  { to: "/", label: "Маркетплейс", exact: true },
  { to: "/my/scenarios", label: "Мои сценарии" },
  { to: "/my/apps", label: "Мои API" },
];

function isActive(item: { to: string; exact?: boolean }) {
  return item.exact ? route.path === item.to : route.path.startsWith(item.to);
}

const fullName = computed(() => {
  const u = authStore.user;
  if (!u) return "";
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || "?";
});
</script>
