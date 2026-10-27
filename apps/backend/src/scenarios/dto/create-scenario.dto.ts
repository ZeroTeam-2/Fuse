import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import type { CreateScenarioDto as SharedCreateScenarioDto } from "@fuse/shared";

export class CreateScenarioDto implements SharedCreateScenarioDto {
  @ApiProperty({ example: "Deploy to Production" })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: "Step-by-step production deployment" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: "devops" })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: "deploy" })
  @IsOptional()
  @IsString()
  subcategory?: string;
}
