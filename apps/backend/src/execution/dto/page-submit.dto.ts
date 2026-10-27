import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsObject, Min } from "class-validator";
import type { PageSubmitDto as SharedPageSubmitDto } from "@fuse/shared";

/** Тело `POST /api/runs/:id/page-submit`. Форма объявлена в `@fuse/shared`. */
export class PageSubmitDto implements SharedPageSubmitDto {
  // Без `@Type(() => Number)`, в отличие от query-DTO: в JSON-теле число
  // приходит числом, и приведение `"0" → 0` спрятало бы ошибку клиента.
  @ApiProperty({ minimum: 0, example: 0 })
  @IsInt()
  @Min(0)
  stepIndex: number;

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description: "Значения блоков страницы шага по их ключам.",
  })
  @IsObject()
  data: Record<string, unknown>;
}
