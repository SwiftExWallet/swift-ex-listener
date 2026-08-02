import { Module } from '@nestjs/common';
import { FirebaseNotificationService } from './notification.service';
import { BulkNotificationService } from './bulk-notification.service';
import { NotificationController } from './notification.controller';
import { DeviceModule } from '../device/device.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DeviceModule, AuthModule],
  providers: [FirebaseNotificationService, BulkNotificationService],
  controllers: [NotificationController],
  exports: [FirebaseNotificationService],
})
export class NotificationModule {}
