import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { ExecutionService } from "./execution.service";

@ApiTags("runs")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("runs")
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Post()
  @ApiOperation({ summary: "Create a new scenario run" })
  create(
    @Req() req: AuthenticatedRequest,
    @Body() body: { scenarioId: string },
  ) {
    return this.executionService.createRun(req.user.userId, body.scenarioId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get run status and results" })
  findById(@Param("id") id: string) {
    return this.executionService.getRun(id);
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "Cancel a run" })
  cancel(@Param("id") id: string) {
    return this.executionService.cancelRun(id);
  }

  @Post(":id/page-submit")
  @ApiOperation({ summary: "Submit page data for a waiting_input run" })
  submitPage(
    @Param("id") id: string,
    @Body() body: { stepIndex: number; data: Record<string, unknown> },
  ) {
    return this.executionService.submitPageData(
      id,
      body.stepIndex,
      body.data,
    );
  }
}
