<template>
  <div class="login-page">
    <div class="login-card">
      <h1 class="login-title">Вход в Fuse</h1>
      <p class="login-subtitle">
        Войдите через Яндекс, чтобы управлять API и сценариями
      </p>
      <a :href="loginUrl" class="yandex-btn">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41C17.93 5.78 20 8.65 20 12c0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
        Войти через Яндекс
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
const loginUrl = `${useApiBase()}/api/auth/login`;
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 56px);
  padding: 24px;
}

.login-card {
  text-align: center;
  max-width: 400px;
}

.login-title {
  font-size: 28px;
  font-weight: 800;
  color: #18181b;
  margin: 0 0 8px;
}

.login-subtitle {
  font-size: 15px;
  color: #71717a;
  margin: 0 0 32px;
}

.yandex-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 24px;
  border-radius: 10px;
  background: #fc3f1d;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s;
}

.yandex-btn:hover {
  background: #e02e0f;
}
</style>
