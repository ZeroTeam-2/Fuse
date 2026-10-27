import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";
import type { CreateRunDto as SharedCreateRunDto } from "@fuse/shared";

/** Тело `POST /api/runs`. Форма объявлена в `@fuse/shared`. */
export class CreateRunDto implements SharedCreateRunDto {
  @ApiProperty({ example: "65f1c2a4b8e3d1f0a9c7b5e2" })
  @IsString()
  @IsNotEmpty()
  scenarioId: string;

  @ApiPropertyOptional({
    type: "object",
    additionalProperties: true,
    description:
      "Значения ручного ввода по скоуп-ключам (`s0:inn`, `s2.s0:filter:status`).",
  })
  @IsOptional()
  @IsObject()
  inputs?: Record<string, unknown>;
}
