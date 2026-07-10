<script setup lang="ts">
// Fuse PublishButton — the publish affordance for entity edit pages.
// Unpublished: a dashed green-outline "Опубликовать" button. On click it pops
// into a solid green "Опубликован" state and fires a confetti burst.
// Controlled via v-model:published, or uncontrolled via `defaultPublished`.
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    published?: boolean;
    defaultPublished?: boolean;
    publishLabel?: string;
    publishedLabel?: string;
    size?: "sm" | "md" | "lg";
  }>(),
  {
    published: undefined,
    defaultPublished: false,
    publishLabel: "Опубликовать",
    publishedLabel: "Опубликован",
    size: "md",
  },
);

const emit = defineEmits<{
  "update:published": [value: boolean];
  publish: [];
  unpublish: [];
}>();

const SIZES = {
  sm: "px-3.5 py-2 text-[0.8125rem] gap-1.5 rounded-lg",
  md: "px-5 py-2.5 text-[0.9375rem] gap-2 rounded-xl",
  lg: "px-6 py-3.5 text-base gap-2.5 rounded-xl",
} as const;

const CONFETTI_COLORS = ["#e11d48", "#16a34a", "#8b5cf6", "#f59e0b", "#3b82f6", "#ec4899"];

const isControlled = computed(() => props.published !== undefined);
const internal = ref(props.defaultPublished);
const published = computed(() => (isControlled.value ? (props.published as boolean) : internal.value));

const btnRef = ref<HTMLButtonElement | null>(null);
const confettiHost = ref<HTMLSpanElement | null>(null);

const skin = computed(() =>
  published.value
    ? "bg-green-600 text-white border-[1.5px] border-green-600 shadow-[0_6px_16px_rgba(22,163,74,0.28)] hover:bg-green-700 hover:border-green-700 active:scale-[.985] cursor-pointer"
    : "bg-green-50/50 text-green-700 border-[1.5px] border-dashed border-green-400 hover:bg-green-50 hover:border-green-600 active:scale-[.985] cursor-pointer",
);

function popButton() {
  const el = btnRef.value;
  if (!el || typeof el.animate !== "function") return;
  el.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.08)", offset: 0.4 },
      { transform: "scale(0.97)", offset: 0.7 },
      { transform: "scale(1)" },
    ],
    { duration: 460, easing: "cubic-bezier(.2,.8,.2,1)" },
  );
}

function fireConfetti() {
  const host = confettiHost.value;
  if (!host || typeof host.animate !== "function") return;
  const N = 28;
  for (let i = 0; i < N; i++) {
    const el = document.createElement("span");
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const w = 5 + Math.random() * 5;
    const round = Math.random() > 0.6;
    el.style.cssText =
      `position:absolute;left:50%;top:50%;width:${w}px;height:${round ? w : w * 0.55}px;` +
      `background:${color};border-radius:${round ? "50%" : "1px"};pointer-events:none;will-change:transform,opacity;`;
    host.appendChild(el);
    const angle = Math.random() * Math.PI * 2;
    const dist = 46 + Math.random() * 78;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - (28 + Math.random() * 46);
    const rot = Math.random() * 720 - 360;
    const dur = 720 + Math.random() * 560;
    const anim = el.animate(
      [
        { transform: "translate(-50%,-50%) rotate(0deg)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg)`, opacity: 1, offset: 0.68 },
        { transform: `translate(calc(-50% + ${dx * 1.18}px), calc(-50% + ${dy + 96}px)) rotate(${rot * 1.5}deg)`, opacity: 0 },
      ],
      { duration: dur, easing: "cubic-bezier(.18,.7,.3,1)", fill: "forwards" },
    );
    anim.onfinish = () => el.remove();
  }
}

function handleClick() {
  if (published.value) {
    if (!isControlled.value) internal.value = false;
    emit("update:published", false);
    emit("unpublish");
    return;
  }
  if (!isControlled.value) internal.value = true;
  emit("update:published", true);
  emit("publish");
  popButton();
  fireConfetti();
}
</script>

<template>
  <button
    ref="btnRef"
    type="button"
    :aria-pressed="published"
    :class="[
      'relative inline-flex items-center justify-center font-sans font-bold tracking-tight leading-none whitespace-nowrap',
      'transition-colors duration-300 select-none',
      SIZES[size],
      skin,
    ]"
    @click="handleClick"
  >
    <svg
      v-if="published"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
    <svg
      v-else
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.25"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M12 19V6" />
      <path d="m6 11 6-6 6 6" />
    </svg>
    <span>{{ published ? publishedLabel : publishLabel }}</span>
    <span ref="confettiHost" aria-hidden="true" class="pointer-events-none absolute left-1/2 top-1/2 z-20" />
  </button>
</template>
