import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { CreateDeviceDto } from './dto/create-device.dto';
import { Device } from './schema/device.schema';

@Injectable()
export class DeviceRepository {
  constructor(
    @InjectModel(Device.name)
    private deviceModel: Model<Device>,
  ) {}

  async findOne(cond: Record<string, any>): Promise<Device | null> {
    return await this.deviceModel.findOne(cond);
  }

  // Fetch _id + fcmToken for a set of device ids. Invalid ObjectId strings are
  // dropped up front so one bad id can't throw the whole query.
  async findByIds(
    ids: string[],
  ): Promise<Array<{ _id: any; fcmToken?: string }>> {
    const valid = ids.filter((id) => isValidObjectId(id));
    if (!valid.length) return [];
    return this.deviceModel
      .find({ _id: { $in: valid } })
      .select('_id fcmToken')
      .lean();
  }

  async create(createDeviceDto: CreateDeviceDto): Promise<Device> {
    const createdDevice = new this.deviceModel(createDeviceDto);
    return createdDevice.save();
  }
}
