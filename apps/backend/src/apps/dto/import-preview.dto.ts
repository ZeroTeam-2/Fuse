import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsUrl } from "class-validator";

export class ImportPreviewDto {
  @ApiProperty({ example: "https://api.example.com/openapi.json" })
  @IsString()
  @IsUrl()
  openapiUrl: string;
}
