import { describe, it, expect } from "vitest";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import type { ArgumentMetadata } from "@nestjs/common";
import { CreateRunDto } from "../src/execution/dto/create-run.dto";
import { PageSubmitDto } from "../src/execution/dto/page-submit.dto";
import { SubmitInputsDto } from "../src/execution/dto/submit-inputs.dto";

// Проверка на уровне пайпа, а не HTTP: vitest собирает тесты через esbuild, а
// он не эмитит `design:paramtypes`, поэтому в тесте Nest не видит метатип тела
// и `ValidationPipe` молча пропускает любой запрос. Здесь метатип передаётся
// явно, с теми же опциями пайпа, что в `src/main.ts`. То, что контроллер
// объявляет именно эти DTO, держится отдельно: в `execution.controller.ts` не
// осталось литеральных тел (`@Body() body: {`), и ручки проверены вживую.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

type Metatype = NonNullable<ArgumentMetadata["metatype"]>;

/** `null`, если тело прошло проверку; иначе статус и текст ошибки. */
async function reject(metatype: Metatype, body: unknown) {
  try {
    await pipe.transform(body, { type: "body", metatype });
    return null;
  } catch (error) {
    const failure = error as BadRequestException;
    return {
      status: failure.getStatus(),
      message: JSON.stringify(failure.getResponse()),
    };
  }
}

/** Прошедшее проверку тело, приведённое обратно к обычному объекту. */
async function accept(metatype: Metatype, body: unknown) {
  return { ...(await pipe.transform(body, { type: "body", metatype })) };
}

describe("Валидация тел запросов исполнения", () => {
  it("запуск без обязательного поля отклоняется", async () => {
    const failure = await reject(CreateRunDto, {});

    expect(failure?.status).toBe(400);
    expect(failure?.message).toMatch(/scenarioId/);
  });

  it("пустая строка в `scenarioId` отклоняется", async () => {
    const failure = await reject(CreateRunDto, { scenarioId: "" });

    expect(failure?.status).toBe(400);
    expect(failure?.message).toMatch(/scenarioId/);
  });

  it("неизвестное поле в теле запуска отклоняется", async () => {
    const failure = await reject(CreateRunDto, {
      scenarioId: "scenario-1",
      isAdmin: true,
    });

    expect(failure?.status).toBe(400);
    expect(failure?.message).toMatch(/isAdmin/);
  });

  it("`stepIndex` строкой в сабмите страницы отклоняется, а не приводится", async () => {
    const failure = await reject(PageSubmitDto, { stepIndex: "0", data: {} });

    expect(failure?.status).toBe(400);
    expect(failure?.message).toMatch(/stepIndex/);
  });

  it("отрицательный `stepIndex` в сабмите страницы отклоняется", async () => {
    const failure = await reject(PageSubmitDto, { stepIndex: -1, data: {} });

    expect(failure?.status).toBe(400);
    expect(failure?.message).toMatch(/stepIndex/);
  });

  it("лишнее поле в сабмите входов отклоняется", async () => {
    const failure = await reject(SubmitInputsDto, {
      stepIndex: 0,
      values: {},
      retryCount: 5,
    });

    expect(failure?.status).toBe(400);
    expect(failure?.message).toMatch(/retryCount/);
  });

  it("корректное тело запуска проходит без изменений", async () => {
    const body = {
      scenarioId: "scenario-1",
      inputs: { "s0:inn": "7701234567" },
    };

    expect(await reject(CreateRunDto, body)).toBeNull();
    expect(await accept(CreateRunDto, body)).toEqual(body);
  });

  it("запуск без `inputs` проходит: поле опционально", async () => {
    expect(await reject(CreateRunDto, { scenarioId: "scenario-1" })).toBeNull();
  });

  it("содержимое `data` и `values` не вычищается whitelist'ом", async () => {
    // Структура страницы и ручных входов зависит от сценария, поэтому вложенные
    // ключи декораторами не описаны — и не должны при этом отсекаться.
    const page = { stepIndex: 2, data: { comment: "ok", nested: { a: 1 } } };
    const inputs = { stepIndex: 0, values: { inn: "7701234567" } };

    expect(await reject(PageSubmitDto, page)).toBeNull();
    expect(await reject(SubmitInputsDto, inputs)).toBeNull();
    expect(await accept(PageSubmitDto, page)).toEqual(page);
    expect(await accept(SubmitInputsDto, inputs)).toEqual(inputs);
  });
});
