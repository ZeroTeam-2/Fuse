/**
 * Сквозной запуск: UI → POST /api/runs → локальная SQS → локальный воркер →
 * терминальный статус. Это та самая проверка, которую раньше нельзя было
 * автоматизировать (пустая БД и вход только через OAuth), и ровно тот путь, на
 * котором запуск «навсегда зависал» в «Выполняем сценарий…», когда очередь
 * делили с задеплоенным бэкендом.
 *
 * Сценарий герметичный (шаг type: "delay"), поэтому тест не зависит от чужих API.
 */
import { expect, test } from "@playwright/test";
import { readSeed } from "./seed";

test("запуск сценария доходит до терминального статуса", async ({ page }) => {
  const { delayScenarioId } = readSeed();

  // Страница запуска карточки: тот же RunPanel, что и во вкладке «Запуск», но без
  // переключения табов.
  await page.goto(`/cards/${delayScenarioId}/run`);

  await page.getByRole("button", { name: "Получить результат" }).click();

  // Пока запуск в полёте — «Выполняем сценарий…». Ждём именно ухода из него.
  const done = page.getByRole("button", { name: "Запустить снова" });
  await expect(done, "запуск завис в «Выполняем сценарий…»").toBeVisible({
    timeout: 60_000,
  });

  // Терминальный — значит завершился, а не упал.
  await expect(page.getByText("Ошибка выполнения")).toHaveCount(0);
  await expect(page.getByText("Выполняем сценарий…")).toHaveCount(0);
});
