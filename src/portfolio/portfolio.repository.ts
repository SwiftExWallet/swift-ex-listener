import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Portfolio,
  PortfolioSyncStatus,
  PortfolioToken,
} from './schema/portfolio.schema';

@Injectable()
export class PortfolioRepository {
  constructor(
    @InjectModel(Portfolio.name)
    private readonly portfolioModel: Model<Portfolio>,
  ) {}

  findByDeviceAndAddress(
    deviceId: any,
    address: string,
  ): Promise<Portfolio | null> {
    return this.portfolioModel.findOne({ deviceId, address }).lean() as any;
  }

  // Ensure the doc exists and mark it syncing. The (deviceId, address) equality
  // in the filter is applied on insert, so upsert creates the record if missing.
  async markSyncing(deviceId: any, address: string): Promise<void> {
    await this.portfolioModel.updateOne(
      { deviceId, address },
      { $set: { syncStatus: PortfolioSyncStatus.syncing } },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  async saveResult(
    deviceId: any,
    address: string,
    data: {
      tokens: PortfolioToken[];
      totalValueUsd: string;
      lastSyncedAt: Date;
      lastFullSyncAt?: Date;
    },
  ): Promise<void> {
    await this.portfolioModel.updateOne(
      { deviceId, address },
      {
        $set: {
          ...data,
          stale: false,
          syncStatus: PortfolioSyncStatus.idle,
          lastSyncError: null,
        },
      },
    );
  }

  async markFailed(
    deviceId: any,
    address: string,
    error: string,
  ): Promise<void> {
    await this.portfolioModel.updateOne(
      { deviceId, address },
      {
        $set: {
          syncStatus: PortfolioSyncStatus.failed,
          lastSyncError: String(error).slice(0, 300),
        },
      },
    );
  }
}
