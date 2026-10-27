import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString } from "class-validator";
import type { UpdateProfileDto as SharedUpdateProfileDto } from "@fuse/shared";

export class UpdateProfileDto implements SharedUpdateProfileDto {
  @ApiPropertyOptional({ example: "Иван" })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: "Иванов" })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: "user@example.com" })
  @IsOptional()
  @IsEmail()
  email?: string;
}
