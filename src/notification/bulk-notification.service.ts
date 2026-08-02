import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DeviceService } from '../device/device.service';
import { FirebaseNotificationService } from './notification.service';
import { BulkNotificationDto } from './dto/bulk-notification.dto';

@Injectable()
export class BulkNotificationService {
  private readonly logger = new Logger(BulkNotificationService.name);

  constructor(
    private readonly deviceService: DeviceService,
    private readonly firebase: FirebaseNotificationService,
  ) {}

  async sendBulk(dto: BulkNotificationDto) {
    const { deviceIds, title, body, data } = dto || ({} as BulkNotificationDto);

    if (!Array.isArray(deviceIds) || deviceIds.length === 0) {
      throw new BadRequestException('deviceIds must be a non-empty array');
    }
    if (!title || !body) {
      throw new BadRequestException('title and body are required');
    }

    const { tokens, missingDeviceIds, noTokenDeviceIds } =
      await this.deviceService.resolveTokens(deviceIds);

    this.logger.log(
      `bulk send: ${deviceIds.length} deviceIds -> ${tokens.length} tokens ` +
        `(missing ${missingDeviceIds.length}, no-token ${noTokenDeviceIds.length})`,
    );

    const result =
      tokens.length > 0
        ? await this.firebase.sendMulticast(tokens, { title, body, data })
        : { successCount: 0, failureCount: 0, invalidTokens: [] };

    return {
      requestedDeviceIds: deviceIds.length,
      resolvedTokens: tokens.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
      missingDeviceIds,
      noTokenDeviceIds,
      invalidTokens: result.invalidTokens,
    };
  }
}
