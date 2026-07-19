import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { RunStatus } from "@fuse/shared";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { ExecutionService } from "./execution.service";
import { RunsListQueryDto } from "./dto/runs-list-query.dto";

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

  @Get()
  @ApiOperation({ summary: "List current user's runs (paginated)" })
  list(@Req() req: AuthenticatedRequest, @Query() query: RunsListQueryDto) {
    const statuses = query.status
      ?.split(",")
      .map((value) => value.trim())
      .filter((value): value is RunStatus =>
        (Object.values(RunStatus) as string[]).includes(value),
      );
    return this.executionService.listRuns(
      req.user.userId,
      query.page,
      query.limit,
      statuses,
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Get run status and results" })
  findById(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.executionService.getRun(id, req.user.userId);
  }

  @Get(":id/file-link")
  @ApiOperation({
    summary: "Get a presigned download URL for a file of the run",
  })
  @ApiQuery({ name: "objectName", required: true })
  getFileLink(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query("objectName") objectName: string,
  ) {
    return this.executionService.getFileLink(id, req.user.userId, objectName);
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "Cancel a run" })
  cancel(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.executionService.cancelRun(id, req.user.userId);
  }

  @Delete(":id")
  @ApiOperation({
    summary: "Delete a finished run with all its stored files",
  })
  async remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    await this.executionService.deleteRun(id, req.user.userId);
    return { success: true };
  }

  @Post(":id/page-submit")
  @ApiOperation({ summary: "Submit page data for a waiting_input run" })
  submitPage(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: { stepIndex: number; data: Record<string, unknown> },
  ) {
    return this.executionService.submitPageData(
      id,
      req.user.userId,
      body.stepIndex,
      body.data,
    );
  }

  @Post(":id/input-submit")
  @ApiOperation({
    summary: "Submit manual input values the worker asked for mid-run",
  })
  submitInputs(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: { stepIndex: number; values: Record<string, unknown> },
  ) {
    return this.executionService.submitInputs(
      id,
      req.user.userId,
      body.stepIndex,
      body.values,
    );
  }
}
