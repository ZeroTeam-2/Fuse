import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedRequest } from "../auth/auth.types";
import { NotificationsService } from "./notifications.service";
import { NotificationsPaginationQueryDto } from "./dto/pagination-query.dto";

@ApiTags("notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "List current user's notifications (paginated)" })
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: NotificationsPaginationQueryDto,
  ) {
    return this.notificationsService.listForUser(
      req.user.userId,
      query.page,
      query.limit,
    );
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Get unread notifications count" })
  unreadCount(@Req() req: AuthenticatedRequest) {
    return this.notificationsService.unreadCount(req.user.userId);
  }

  @Post(":id/read")
  @ApiOperation({ summary: "Mark a notification as read" })
  async markRead(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    await this.notificationsService.markRead(id, req.user.userId);
    return { success: true };
  }

  @Post("read-all")
  @ApiOperation({ summary: "Mark all notifications as read" })
  async markAllRead(@Req() req: AuthenticatedRequest) {
    await this.notificationsService.markAllRead(req.user.userId);
    return { success: true };
  }
}
