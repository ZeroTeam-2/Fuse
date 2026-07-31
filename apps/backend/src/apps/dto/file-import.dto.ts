import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class FileImportDto {
  @ApiProperty({ example: "My API" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: "A great API for stuff" })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: "https://api.example.com" })
  @IsOptional()
  @IsUrl()
  baseUrl?: string;
}

export class ImportPreviewFileDto {
  @ApiPropertyOptional({ example: "https://api.example.com" })
  @IsOptional()
  @IsUrl()
  baseUrl?: string;
}
