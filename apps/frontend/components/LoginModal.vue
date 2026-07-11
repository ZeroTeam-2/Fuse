<script setup lang="ts">
// Глобальная модалка входа. Единственный способ авторизации — Яндекс ID,
// поэтому внутри фирменная кнопка Яндекса, а не DS-кнопка Fuse.
const { open, reason, error, openLogin, openWithError, close } = useLoginModal();

const route = useRoute();
const router = useRouter();

const loginUrl = `${useApiBase()}/api/auth/login`;

// /login редиректит сюда с ?authError=… или ?login=1 (см. pages/login/index.vue).
onMounted(() => {
  const { authError, login, ...rest } = route.query;
  if (typeof authError === "string" && authError) openWithError(authError);
  else if (login) openLogin();
  else return;
  router.replace({ path: route.path, query: rest });
});

// Бэкенд возвращает пользователя сюда с ?error=… когда OAuth не удался.
const ERRORS: Record<string, string> = {
  cancelled: "Вход отменён. Попробуйте ещё раз.",
  missing_code: "Яндекс не передал код авторизации. Попробуйте ещё раз.",
  invalid_code: "Не удалось подтвердить вход. Попробуйте ещё раз.",
};

const errorMessage = computed(() =>
  error.value ? (ERRORS[error.value] ?? "Не удалось войти. Попробуйте ещё раз.") : "",
);
</script>

<template>
  <Modal v-if="open" :width="440" @close="close">
    <div class="relative flex flex-col items-center text-center pt-2 pb-3">
      <!-- Modal рисует крестик только вместе с заголовком, а он тут не нужен. -->
      <IconButton
        variant="outline"
        label="Закрыть"
        :size="34"
        class="absolute right-0 top-0"
        @click="close"
      >
        <Icon name="x" :size="16" />
      </IconButton>

      <BrandMark :size="44" class="mb-6" />

      <h2
        class="font-sans font-extrabold text-[1.625rem] leading-tight tracking-tight text-zinc-900 mb-2"
      >
        Вход в Fuse
      </h2>
      <p class="font-sans text-[0.9375rem] text-zinc-500 mb-7">
        {{ reason || "Войдите через Яндекс, чтобы подключать API и собирать сценарии." }}
      </p>

      <p
        v-if="errorMessage"
        class="w-full font-sans text-[0.8125rem] text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 mb-5"
      >
        {{ errorMessage }}
      </p>

      <!-- Фирменная кнопка Яндекс ID: красный #FC3F1D и белый логотип «Я». -->
      <a
        :href="loginUrl"
        class="inline-flex w-full items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-sans font-bold text-base leading-none text-white bg-[#FC3F1D] transition hover:bg-[#E63514] active:scale-[.985]"
      >
        <span
          aria-hidden="true"
          class="w-6 h-6 rounded-full bg-white text-[#FC3F1D] inline-flex items-center justify-center font-sans font-bold text-[0.9375rem] leading-none shrink-0"
        >
          Я
        </span>
        Войти с Яндекс ID
      </a>

      <p class="font-sans text-[0.75rem] text-zinc-400 mt-5">
        Продолжая, вы соглашаетесь с условиями использования Fuse.
      </p>
    </div>
  </Modal>
</template>
