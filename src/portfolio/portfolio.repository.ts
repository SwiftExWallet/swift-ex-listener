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

  findByAddress(address: string): Promise<Portfolio | null> {
    return this.portfolioModel.findOne({ address }).lean() as any;
  }

  // Ensure the doc exists (keyed by address) and mark it syncing. deviceId is
  // stored/overwritten with whichever device triggered this sync.
  async markSyncing(deviceId: any, address: string): Promise<void> {
    await this.portfolioModel.updateOne(
      { address },
      { $set: { syncStatus: PortfolioSyncStatus.syncing, deviceId } },
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
      { address },
      {
        $set: {
          ...data,
          deviceId,
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
      { address },
      {
        $set: {
          deviceId,
          syncStatus: PortfolioSyncStatus.failed,
          lastSyncError: String(error).slice(0, 300),
        },
      },
    );
  }
}
