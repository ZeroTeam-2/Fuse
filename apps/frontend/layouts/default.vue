<template>
  <div class="min-h-screen flex flex-col bg-zinc-50">
    <TopNav />

    <main class="flex-1">
      <slot />
    </main>

    <LoginModal />
  </div>
</template>
