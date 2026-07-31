import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

// Base URL валидируется в сервисе (isAbsoluteHttpUrl) — так проходит и localhost
// в деве, который @IsUrl по умолчанию отбраковал бы за отсутствие TLD.
export class CreateEnvironmentDto {
  @ApiProperty({ example: "Staging" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: "https://staging.api.example.com" })
  @IsString()
  @IsNotEmpty()
  baseUrl: string;
}

export class UpdateEnvironmentDto {
  @ApiPropertyOptional({ example: "Staging" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: "https://staging.api.example.com" })
  @IsOptional()
  @IsString()
  baseUrl?: string;
}
