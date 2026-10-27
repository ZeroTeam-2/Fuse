import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";
import type {
  EnvironmentSelection,
  Step,
  UpdateScenarioDto as SharedUpdateScenarioDto,
} from "@fuse/shared";

export class UpdateScenarioDto implements SharedUpdateScenarioDto {
  @ApiPropertyOptional({ example: "Deploy to Production" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional({ example: "Step-by-step production deployment" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: "https://cdn.example.com/cover.png" })
  @IsOptional()
  @IsString()
  coverUrl?: string;

  @ApiPropertyOptional({ example: "devops" })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: "deploy" })
  @IsOptional()
  @IsString()
  subcategory?: string;

  // Структура шага рантаймом здесь не проверяется — её держат
  // `assertValidPageSteps` и `cycle-guard` в сервисе. Тип фиксирует контракт
  // на границе API, чтобы сервис не утверждал его приведениями.
  @ApiPropertyOptional({ type: "array" })
  @IsOptional()
  @IsArray()
  steps?: Step[];

  @ApiPropertyOptional({
    type: "array",
    description: "Per-provider environment choice: { appId, environmentId }[]",
  })
  @IsOptional()
  @IsArray()
  environmentSelections?: EnvironmentSelection[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
