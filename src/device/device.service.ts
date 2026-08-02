import { Injectable, Logger } from '@nestjs/common';
import { Device } from './schema/device.schema';
import { DeviceRepository } from './device.repository';
import mongoose from 'mongoose';

@Injectable()
export class DeviceService {
  private readonly logger = new Logger(DeviceService.name);

  constructor(private readonly deviceRepo: DeviceRepository) {}

  findOne(_id: mongoose.Schema.Types.ObjectId): Promise<Device | null> {
    return this.deviceRepo.findOne({ _id });
  }

  findOneByUniqueId(uniqueId: string): Promise<Device | null> {
    return this.deviceRepo.findOne({ uniqueId });
  }

  // Resolve a list of deviceIds into their FCM tokens. Reports which ids were
  // unknown and which are registered but have no token, so callers can log gaps.
  async resolveTokens(deviceIds: string[]): Promise<{
    tokens: string[];
    missingDeviceIds: string[];
    noTokenDeviceIds: string[];
  }> {
    const unique = [...new Set(deviceIds.map((id) => String(id)))];
    const devices = await this.deviceRepo.findByIds(unique);
    const byId = new Map(devices.map((d) => [String(d._id), d.fcmToken]));

    const tokens: string[] = [];
    const missingDeviceIds: string[] = [];
    const noTokenDeviceIds: string[] = [];

    for (const id of unique) {
      if (!byId.has(id)) {
        missingDeviceIds.push(id);
      } else if (!byId.get(id)) {
        noTokenDeviceIds.push(id);
      } else {
        tokens.push(byId.get(id) as string);
      }
    }
    // De-dupe tokens in case two device docs share one (shouldn't, but safe).
    return { tokens: [...new Set(tokens)], missingDeviceIds, noTokenDeviceIds };
  }
}
