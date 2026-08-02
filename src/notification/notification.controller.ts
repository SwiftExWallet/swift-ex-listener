import { Body, Controller, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BulkNotificationService } from './bulk-notification.service';
import { BulkNotificationDto } from './dto/bulk-notification.dto';

@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(private readonly bulkService: BulkNotificationService) {}

  @UseGuards(JwtAuthGuard)
  @Post('bulk')
  async sendBulk(@Body() body: BulkNotificationDto, @Req() _: any) {
    this.logger.log(
      `Received bulk notification request for ${body?.deviceIds?.length ?? 0} deviceIds`,
    );
    return this.bulkService.sendBulk(body);
  }
}
