import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsUrl } from "class-validator";
import type { ImportPreviewDto as SharedImportPreviewDto } from "@fuse/shared";

export class ImportPreviewDto implements SharedImportPreviewDto {
  @ApiProperty({ example: "https://api.example.com/openapi.json" })
  @IsString()
  @IsUrl()
  openapiUrl: string;
}
