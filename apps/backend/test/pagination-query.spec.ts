import { describe, it, expect } from "vitest";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import type { ArgumentMetadata } from "@nestjs/common";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../src/common/dto/pagination-query.dto";

// Проверка на уровне пайпа, а не HTTP: vitest собирает тесты через esbuild, а
// он не эмитит `design:paramtypes`, поэтому в тесте Nest не видит метатип
// query и `ValidationPipe` молча пропускает любой запрос (та же причина, что
// в `execution-body-validation.spec.ts`). Опции пайпа — как в `src/main.ts`.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

type Metatype = NonNullable<ArgumentMetadata["metatype"]>;

/** Наследник базового DTO — ровно та форма, в которой живут списочные ручки. */
class ChildQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

async function reject(metatype: Metatype, query: unknown) {
  try {
    await pipe.transform(query, { type: "query", metatype });
    return null;
  } catch (error) {
    const failure = error as BadRequestException;
    return {
      status: failure.getStatus(),
      message: JSON.stringify(failure.getResponse()),
    };
  }
}

async function accept(metatype: Metatype, query: unknown) {
  return { ...(await pipe.transform(query, { type: "query", metatype })) };
}

describe("Наследование пагинации в query-DTO", () => {
  it("наследник принимает page/limit базового класса", async () => {
    expect(await accept(ChildQueryDto, { page: "2", limit: "5" })).toMatchObject({
      page: 2,
      limit: 5,
    });
  });

  it("наследник принимает собственное поле вместе с пагинацией", async () => {
    expect(
      await accept(ChildQueryDto, { page: "2", status: "running" }),
    ).toMatchObject({ page: 2, limit: 20, status: "running" });
  });

  it("границы базового класса действуют у наследника", async () => {
    expect((await reject(ChildQueryDto, { limit: "101" }))?.status).toBe(400);
    expect((await reject(ChildQueryDto, { page: "0" }))?.status).toBe(400);
  });

  it("неизвестный параметр у наследника отклоняется", async () => {
    const failure = await reject(ChildQueryDto, { page: "1", unknown: "1" });

    expect(failure?.status).toBe(400);
    expect(failure?.message).toMatch(/unknown/);
  });
});
