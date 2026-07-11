<script setup lang="ts">
// Страницы входа больше нет: вход — модалка. Маршрут оставлен потому, что
// OAuth-колбэк бэкенда возвращает сюда с ?error=… (см. auth.controller.ts).
// Редирект случается ещё на сервере, поэтому повод открыть модалку передаём
// через query — её разбирает LoginModal уже на клиенте.
const route = useRoute();

const errorCode = typeof route.query.error === "string" ? route.query.error : "";

await navigateTo(
  { path: "/", query: errorCode ? { authError: errorCode } : { login: "1" } },
  { replace: true },
);
</script>

<template>
  <div />
</template>
