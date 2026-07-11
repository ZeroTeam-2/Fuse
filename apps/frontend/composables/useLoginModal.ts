/**
 * Логин — не страница, а глобальная модалка: её открывают шапка, попытка
 * запустить сценарий гостем и middleware при заходе на приватный маршрут.
 * Состояние общее (useState), поэтому модалку можно открыть откуда угодно.
 */
export function useLoginModal() {
  const open = useState("login-modal-open", () => false);
  const reason = useState("login-modal-reason", () => "");
  const error = useState("login-modal-error", () => "");

  function openLogin(withReason = "") {
    reason.value = withReason;
    open.value = true;
  }

  function openWithError(code: string) {
    error.value = code;
    reason.value = "";
    open.value = true;
  }

  function close() {
    open.value = false;
    reason.value = "";
    error.value = "";
  }

  return { open, reason, error, openLogin, openWithError, close };
}
