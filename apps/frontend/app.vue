<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <AppToast ref="appToast" />
</template>

<script setup lang="ts">
const appToast = ref<{ showToast: (msg: string, type?: string) => void } | null>(null)

provide('appToast', appToast)
</script>
