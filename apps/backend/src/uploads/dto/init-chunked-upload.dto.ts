import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsString, Min } from "class-validator";

export class InitChunkedUploadDto {
  @ApiProperty({ example: "data.csv" })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ example: 52428800 })
  @IsNumber()
  @Min(1)
  fileSize: number;

  @ApiProperty({ example: "text/csv" })
  @IsString()
  @IsNotEmpty()
  contentType: string;
}
