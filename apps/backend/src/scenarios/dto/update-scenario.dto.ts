import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateScenarioDto {
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

  @ApiPropertyOptional({ type: "array" })
  @IsOptional()
  @IsArray()
  steps?: unknown[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
