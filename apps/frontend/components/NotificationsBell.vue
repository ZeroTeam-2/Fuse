<script setup lang="ts">
// Колокольчик уведомлений — Vue-порт NotificationBell из эталона DS
// (assets/Fuse Design System/ui_kits/fuse-app/Runs.jsx). Данные — из стора
// уведомлений (REST при загрузке + socket.io в реальном времени).
import type { RunNotification } from "@fuse/shared";

const store = useNotificationsStore();
const { connect, disconnect } = useNotificationsSocket();

const open = ref(false);
const wrapRef = ref<HTMLElement | null>(null);
let markReadTimer: ReturnType<typeof setTimeout> | null = null;

function toggle() {
  open.value = !open.value;
  if (open.value) {
    // Эталонное поведение: открытая панель гасит непрочитанные — с паузой,
    // чтобы пользователь успел увидеть, что именно было новым.
    markReadTimer = setTimeout(() => void store.markAllRead(), 1200);
  } else if (markReadTimer) {
    clearTimeout(markReadTimer);
    markReadTimer = null;
  }
}

async function openNotification(item: RunNotification) {
  open.value = false;
  await navigateTo(`/cards/${item.scenarioId}/run?run=${item.runId}`);
}

async function goToRuns() {
  open.value = false;
  await navigateTo("/my/runs");
}

function onDocMouseDown(e: MouseEvent) {
  if (open.value && !wrapRef.value?.contains(e.target as Node)) open.value = false;
}

onMounted(() => {
  document.addEventListener("mousedown", onDocMouseDown);
  void store.fetchInitial();
  connect();
});

onBeforeUnmount(() => {
  document.removeEventListener("mousedown", onDocMouseDown);
  if (markReadTimer) clearTimeout(markReadTimer);
  disconnect();
});
</script>

<template>
  <div ref="wrapRef" class="relative">
    <button
      type="button"
      aria-label="Уведомления"
      class="relative w-[38px] h-[38px] rounded-full inline-flex items-center justify-center cursor-pointer border-0 transition-colors"
      :class="open ? 'bg-zinc-100 text-zinc-900' : 'bg-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'"
      @click="toggle"
    >
      <Icon name="bell" :size="20" />
      <span
        v-if="store.unreadCount > 0"
        class="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-600 text-white font-sans text-[0.625rem] font-bold inline-flex items-center justify-center border-2 border-white"
      >
        {{ store.unreadCount }}
      </span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-[calc(100%+10px)] w-[360px] bg-white border border-zinc-200 rounded-2xl overflow-hidden z-50 shadow-[0_24px_64px_rgba(24,24,27,0.18)]"
    >
      <div class="flex items-center justify-between px-4 py-3.5 border-b border-zinc-100">
        <span class="font-sans font-bold text-[0.9375rem] text-zinc-900">Уведомления</span>
        <span v-if="store.unreadCount > 0" class="font-sans text-xs font-semibold text-rose-600">
          {{ store.unreadCount }} новых
        </span>
      </div>

      <div class="max-h-[360px] overflow-y-auto">
        <div
          v-if="store.items.length === 0"
          class="px-4 py-10 text-center font-sans text-[0.875rem] text-zinc-400"
        >
          Пока нет уведомлений
        </div>
        <button
          v-for="item in store.items"
          :key="item.id"
          type="button"
          class="w-full text-left bg-transparent border-0 cursor-pointer flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors border-b border-zinc-50"
          @click="openNotification(item)"
        >
          <RunStatusTile :status="NOTIFICATION_RUN_STATUS[item.type]" :size="32" />
          <div class="min-w-0 flex-1">
            <div class="font-sans text-[0.875rem] text-zinc-900 leading-snug">
              <span class="font-semibold">{{ item.scenarioTitle }}</span>
              — {{ NOTIFICATION_MESSAGE[item.type] }}
            </div>
            <div class="font-sans text-xs text-zinc-400 mt-0.5">
              {{ formatRelativeTime(item.createdAt) }}
            </div>
          </div>
          <span v-if="!item.read" class="w-2 h-2 rounded-full bg-rose-600 shrink-0 mt-1.5" />
        </button>
      </div>

      <button
        type="button"
        class="w-full bg-zinc-50 hover:bg-zinc-100 border-0 border-t border-zinc-100 cursor-pointer font-sans text-[0.875rem] font-semibold text-zinc-900 py-3 transition-colors"
        @click="goToRuns"
      >
        Все запуски →
      </button>
    </div>
  </div>
</template>
