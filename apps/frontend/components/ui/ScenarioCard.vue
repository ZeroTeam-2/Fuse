<script setup lang="ts">
// Fuse ScenarioCard — a marketplace/use-case card. Media cover on top, then
// title, description, an info row (provider + right meta), and optional actions.
// Slots: #status (cover overlay badge), #actions (footer actions).
import { computed, getCurrentInstance } from "vue";

export interface ScenarioCover {
  src?: string;
  variant?: "striped" | "mint" | "plain";
  icon?: string;
}

const props = defineProps<{
  cover?: ScenarioCover;
  title?: string;
  description?: string;
  provider?: { name: string };
  meta?: string;
  interactive?: boolean;
  /** Делает карточку настоящей ссылкой (<NuxtLink>) — надёжнее, чем ловить click
   * через JS: работает Ctrl/Cmd+клик, средняя кнопка, «открыть в новой вкладке». */
  to?: string;
}>();

const emit = defineEmits<{ click: [] }>();
const slots = defineSlots<{ status?: unknown; actions?: unknown }>();

const VARIANTS = {
  striped: {
    cls: "bg-[repeating-linear-gradient(135deg,#eef0f8_0px,#eef0f8_14px,#e8eaf4_14px,#e8eaf4_28px)]",
    icon: "share-2",
    color: "var(--violet-600)",
  },
  mint: {
    cls: "bg-[linear-gradient(160deg,#eafaf0_0%,#dff4e8_100%)]",
    icon: "file-text",
    color: "var(--green-600)",
  },
  plain: { cls: "bg-zinc-100", icon: "", color: "" },
} as const;

const v = computed(() => VARIANTS[props.cover?.variant ?? "striped"]);
const coverIcon = computed(() => props.cover?.icon || v.value.icon);

const inst = getCurrentInstance();
const isInteractive = computed(
  () => props.interactive || !!props.to || !!inst?.vnode.props?.onClick,
);
</script>

<template>
  <Card
    :interactive="isInteractive"
    padding="none"
    :to="to"
    class="overflow-hidden flex flex-col"
    @click="emit('click')"
  >
    <!-- Cover -->
    <template v-if="cover || slots.status">
      <div v-if="cover?.src" class="relative overflow-hidden" style="aspect-ratio: 16 / 9; width: 100%">
        <img :src="cover.src" alt="" class="absolute inset-0 w-full h-full object-cover" />
        <div
          v-if="slots.status"
          class="absolute top-3 right-3 z-10 drop-shadow-[0_2px_6px_rgba(0,0,0,0.18)]"
        >
          <slot name="status" />
        </div>
      </div>
      <div v-else-if="cover" class="relative">
        <div
          :class="['flex items-center justify-center', v.cls]"
          style="aspect-ratio: 16 / 9; width: 100%"
        >
          <IconButton v-if="coverIcon" variant="floating" :size="52" label="">
            <Icon :name="coverIcon" :size="20" :color="v.color || 'currentColor'" />
          </IconButton>
        </div>
        <div
          v-if="slots.status"
          class="absolute top-3 right-3 z-10 drop-shadow-[0_2px_6px_rgba(0,0,0,0.18)]"
        >
          <slot name="status" />
        </div>
      </div>
      <div v-else class="relative w-full bg-zinc-100" style="aspect-ratio: 16 / 9">
        <div class="absolute top-3 right-3 z-10"><slot name="status" /></div>
      </div>
    </template>

    <div class="p-5 flex flex-col gap-2 flex-1">
      <h3 class="font-sans font-bold text-[1.0625rem] leading-snug tracking-tight text-zinc-900">
        {{ title }}
      </h3>
      <p v-if="description" class="font-sans text-sm text-zinc-500 leading-normal">{{ description }}</p>
      <div v-if="provider || meta" class="flex items-center justify-between gap-3 mt-1.5">
        <span v-if="provider" class="inline-flex items-center gap-2.5">
          <ProviderIcon :name="provider.name" :size="22" />
          <span class="font-sans text-sm font-semibold text-zinc-900">{{ provider.name }}</span>
        </span>
        <span v-else />
        <span v-if="meta" class="font-sans text-[0.8125rem] text-zinc-400">{{ meta }}</span>
      </div>
      <div v-if="slots.actions" class="flex gap-2.5 mt-1.5"><slot name="actions" /></div>
    </div>
  </Card>
</template>
