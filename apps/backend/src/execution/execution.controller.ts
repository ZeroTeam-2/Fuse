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
    @Body() body: { scenarioId: string; inputs?: Record<string, unknown> },
  ) {
    return this.executionService.createRun(
      req.user.userId,
      body.scenarioId,
      body.inputs,
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Get run status and results" })
  findById(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.executionService.getRun(id, req.user.userId);
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

  @Post(":id/input-submit")
  @ApiOperation({
    summary: "Submit manual input values the worker asked for mid-run",
  })
  submitInputs(
    @Param("id") id: string,
    @Body() body: { stepIndex: number; values: Record<string, unknown> },
  ) {
    return this.executionService.submitInputs(id, body.stepIndex, body.values);
  }
}
