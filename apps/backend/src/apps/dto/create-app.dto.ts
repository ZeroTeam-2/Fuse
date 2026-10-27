import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";
import type { CreateAppDto as SharedCreateAppDto } from "@fuse/shared";

export class CreateAppDto implements SharedCreateAppDto {
  @ApiProperty({ example: "My API" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: "A great API for stuff" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: "https://api.example.com/openapi.json" })
  @IsString()
  @IsUrl()
  openapiUrl: string;
}
