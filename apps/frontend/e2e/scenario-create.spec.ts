/**
 * Регрессия на баг с дублями: POST создавал сценарий, но упавшая навигация в
 * редактор ловилась общим catch и показывалась как «Не удалось создать
 * сценарий». Пользователь жал «Создать» снова — и получал по сценарию на клик.
 */
import { expect, test } from "@playwright/test";

test("создание сценария создаёт ровно один", async ({ page, request }) => {
  const title = `E2E сценарий ${Date.now()}`;

  await page.goto("/my/scenarios");
  await page.getByRole("button", { name: /Создать сценарий|Новый сценарий/i }).first().click();

  await page.getByLabel("Название сценария").fill(title);
  await page.getByRole("button", { name: "Создать и открыть" }).click();

  // Успех = ушли в редактор нового сценария.
  await expect(page).toHaveURL(/\/my\/scenarios\/[\da-f]+\/edit/, { timeout: 15_000 });
  const scenarioId = page.url().match(/scenarios\/([\da-f]+)\/edit/)![1];

  // Ошибка создания не показывается, когда сценарий на самом деле создан.
  await expect(page.getByText("Не удалось создать сценарий")).toHaveCount(0);

  // И главное: в списке ровно один сценарий с этим названием.
  await page.goto("/my/scenarios");
  await expect(page.getByText(title, { exact: true })).toHaveCount(1);

  // Прогоны не должны копить мусор в локальной БД.
  await request.delete(`http://localhost:3001/api/scenarios/${scenarioId}`);
});
