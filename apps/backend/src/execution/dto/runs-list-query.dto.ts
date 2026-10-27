import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

export class RunsListQueryDto extends PaginationQueryDto {
  /** Фильтр по статусам, через запятую: `running,waiting_input`. */
  @ApiPropertyOptional({ example: "running,waiting_input" })
  @IsOptional()
  @IsString()
  status?: string;
}
