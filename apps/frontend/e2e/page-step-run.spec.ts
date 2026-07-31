/**
 * Сквозной прогон сценария с page-шагами (сид «Демо: страницы»):
 * страница ввода приостанавливает запуск, введённое значение уезжает в api-шаг
 * маппингом `s0:inn`, финальная display-страница остаётся экраном результата
 * после завершения — её `run:done` не скрывает.
 */
import { expect, test } from "@playwright/test";
import { readSeed } from "./seed";

test("страница ввода → api-шаг → финальная страница с ответом", async ({ page }) => {
  const { pageScenarioId } = readSeed();

  await page.goto(`/cards/${pageScenarioId}/run`);

  // Page-шаги дескрипторов не порождают — форма перед запуском ничего не
  // спрашивает, есть только кнопка запуска.
  await page.getByRole("button", { name: "Получить результат" }).click();

  // Шаг 1: страница ввода — запуск ждёт значение обязательного блока.
  const inn = page.getByLabel(/ИНН/);
  await expect(inn, "страница ввода не показалась").toBeVisible({ timeout: 60_000 });

  const submit = page.getByRole("button", { name: "Продолжить" });
  await expect(submit, "пустое обязательное поле должно блокировать сабмит").toBeDisabled();

  await inn.fill("7707083893");
  await submit.click();

  // Финальная display-страница остаётся видимой после run:done, рядом — сводка.
  await expect(page.getByText("Результат готов")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Готово! Ниже — адрес, на который ушёл запрос.")).toBeVisible();
  // Блок отображения показал значение `url` из ответа эхо-API (s1:url).
  await expect(page.getByText(/\/post/).first()).toBeVisible();
  await expect(page.getByText("Ошибка выполнения")).toHaveCount(0);
});
