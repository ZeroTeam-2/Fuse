import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsObject, Min } from "class-validator";
import type { SubmitInputsDto as SharedSubmitInputsDto } from "@fuse/shared";

/** Тело `POST /api/runs/:id/input-submit`. Форма объявлена в `@fuse/shared`. */
export class SubmitInputsDto implements SharedSubmitInputsDto {
  // Без `@Type(() => Number)` — см. `page-submit.dto.ts`.
  @ApiProperty({ minimum: 0, example: 0 })
  @IsInt()
  @Min(0)
  stepIndex: number;

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description: "Значения ручных входов шага по ключам входов.",
  })
  @IsObject()
  values: Record<string, unknown>;
}
