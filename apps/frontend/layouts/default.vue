<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="header-inner">
        <NuxtLink to="/" class="logo">Fuse</NuxtLink>
        <nav class="nav-links">
          <NuxtLink to="/" class="nav-link">Маркетплейс</NuxtLink>
          <NuxtLink to="/my/scenarios" class="nav-link">Мои сценарии</NuxtLink>
          <NuxtLink to="/my/apps" class="nav-link">Мои API</NuxtLink>
        </nav>
        <div class="header-right">
          <template v-if="authStore.user">
            <NuxtLink to="/profile" class="avatar-link">
              <span v-if="!authStore.user.avatarUrl" class="avatar-placeholder">
                {{ initials }}
              </span>
              <img
                v-else
                :src="authStore.user.avatarUrl"
                alt="avatar"
                class="avatar-img"
              />
            </NuxtLink>
          </template>
          <NuxtLink v-else to="/login" class="login-btn">Войти</NuxtLink>
        </div>
      </div>
    </header>
    <main class="app-main">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const authStore = useAuthStore();

const initials = computed(() => {
  const u = authStore.user;
  if (!u) return "";
  const f = u.firstName?.[0] ?? "";
  const l = u.lastName?.[0] ?? "";
  return (f + l).toUpperCase() || "?";
});
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background: #fff;
  border-bottom: 1px solid #e4e4e7;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
  height: 56px;
  display: flex;
  align-items: center;
  gap: 32px;
}

.logo {
  font-size: 20px;
  font-weight: 800;
  color: #18181b;
  text-decoration: none;
  letter-spacing: -0.02em;
}

.nav-links {
  display: flex;
  gap: 24px;
  flex: 1;
}

.nav-link {
  font-size: 14px;
  font-weight: 500;
  color: #52525b;
  text-decoration: none;
  transition: color 0.15s;
}

.nav-link:hover,
.nav-link.router-link-active {
  color: #18181b;
}

.header-right {
  display: flex;
  align-items: center;
}

.login-btn {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: #e11d48;
  padding: 8px 16px;
  border-radius: 8px;
  text-decoration: none;
  transition: background 0.15s;
}

.login-btn:hover {
  background: #be123c;
}

.avatar-link {
  display: flex;
  align-items: center;
  text-decoration: none;
}

.avatar-placeholder {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #6366f1;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
}

.avatar-img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}

.app-main {
  flex: 1;
}
</style>
