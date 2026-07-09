import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsUrl } from "class-validator";

export class UpdateAppDto {
  @ApiPropertyOptional({ example: "My API" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: "A great API for stuff" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: "https://api.example.com/openapi.json" })
  @IsOptional()
  @IsString()
  @IsUrl()
  openapiUrl?: string;
}
