import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { ScenariosService } from "./scenarios.service";
import { CreateScenarioDto } from "./dto/create-scenario.dto";
import { UpdateScenarioDto } from "./dto/update-scenario.dto";
import { ScenarioPaginationQueryDto } from "./dto/pagination-query.dto";

@ApiTags("scenarios")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("scenarios")
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

  @Get()
  @ApiOperation({ summary: "List user's scenarios (paginated)" })
  findByOwner(
    @Req() req: AuthenticatedRequest,
    @Query() query: ScenarioPaginationQueryDto,
  ) {
    return this.scenariosService.findByOwner(
      req.user.userId,
      query.page,
      query.limit,
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single scenario" })
  findById(@Param("id") id: string) {
    return this.scenariosService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: "Create a new scenario" })
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateScenarioDto,
  ) {
    return this.scenariosService.create(req.user.userId, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update scenario metadata and/or steps" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateScenarioDto,
  ) {
    return this.scenariosService.update(id, dto);
  }

  @Patch(":id/publish")
  @ApiOperation({ summary: "Toggle scenario published status" })
  togglePublish(@Param("id") id: string) {
    return this.scenariosService.togglePublish(id);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a scenario" })
  delete(@Param("id") id: string) {
    return this.scenariosService.delete(id);
  }

  @Get(":id/step-schema/:index")
  @ApiOperation({ summary: "Get step input/output schema for mapping" })
  getStepSchema(
    @Param("id") id: string,
    @Param("index") index: string,
  ) {
    return this.scenariosService.getStepSchema(id, Number(index));
  }
}
