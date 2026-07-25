import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Wallet } from './schema/wallet.schema';
import { WalletWithDevice } from './wallet.types';

@Injectable()
export class WalletRepository {
  private readonly logger = new Logger(WalletRepository.name);
  constructor(
    @InjectModel(Wallet.name)
    private walletModel: Model<Wallet>,
  ) {
 //   this.migrateWalletFields();
  }

  async findOne(cond: Record<string, any>): Promise<Wallet | null> {
    return await this.walletModel.findOne(cond);
  }

  async find(cond: Record<string, any>): Promise<Wallet[] | null> {
    return await this.walletModel.find(cond);
  }

  async findWallets(limit: number, offset: number): Promise<Wallet[] | null> {
    return this.walletModel.find({}).skip(offset).limit(limit);
  }

  async totalCount(): Promise<number> {
    return this.walletModel.countDocuments();
  }

  async findAllByWithDevice(
    limit: number,
    offset: number,
  ): Promise<WalletWithDevice[] | null> {
    return this.walletModel.find({}).skip(offset).limit(limit).populate({
      path: 'deviceId',
      select: 'fcmToken',
    }) as unknown as WalletWithDevice[];
  }

  async findAllXlmWithDevice(limit: number, offset: number): Promise<WalletWithDevice[]> {
    return this.walletModel.find({ 'addresses.xlm': { $exists: true, $ne: '' } }).skip(offset).limit(limit).populate({
      path: 'deviceId',
      select: 'fcmToken',
    }) as unknown as WalletWithDevice[];
  }

  async totalXlmCount(): Promise<number> {
    return this.walletModel.countDocuments({ 'addresses.xlm': { $exists: true, $ne: '' } });
  }

  async findOneByMultiWithDevice(address: string): Promise<WalletWithDevice | null> {
    // EVM addresses may be stored checksummed (mixed-case) while Alchemy webhooks
    // send them lowercase — match case-insensitively. A single address can be
    // shared by multiple wallets/devices, so return the most recently created one.
    const escaped = address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.walletModel
      .findOne({
        'addresses.multi': { $regex: `^${escaped}$`, $options: 'i' },
        deviceId: { $ne: null },
      })
      .sort({ createdAt: -1 })
      .populate({ path: 'deviceId', select: 'fcmToken' }) as unknown as WalletWithDevice;
  }

  async findOneByXlmWithDevice(address: string): Promise<WalletWithDevice | null> {
    // A Stellar address can be shared by multiple wallets/devices — return the
    // most recently created one so the latest device gets the notification.
    return this.walletModel
      .findOne({ 'addresses.xlm': address, deviceId: { $ne: null } })
      .sort({ createdAt: -1 })
      .populate({ path: 'deviceId', select: 'fcmToken' }) as unknown as WalletWithDevice;
  }

  // async migrateWalletFields(): Promise<void> {
  //   try {
  //     const result = await this.walletModel.updateMany(
  //       { wallets: { $exists: false } },
  //       [
  //         {
  //           $set: {
  //             addresses: {
  //               bnb: '$multiChainAddress',
  //               eth: '$multiChainAddress',
  //               multi: '$multiChainAddress',
  //               xlm: '$stellarAddress',
  //             },
  //           },
  //         },
  //         {
  //           $unset: ['multiChainAddress', 'stellarAddress'],
  //         },
  //       ],
  //     );

  //     this.logger.log(
  //       `Migration complete. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`,
  //     );
  //   } catch (error) {
  //     this.logger.error('Error running wallet migration', error);
  //     throw error;
  //   }
  // }

  async migrateWalletFields(): Promise<void> {
    try {
      const result = await this.walletModel.updateMany(
   { wallets: { $exists: true } },
  [
    {
      $set: { addresses: "$wallets" }
    },
    {
      $unset: "wallets"
    }
  ]
      );

      this.logger.log(
        `Migration complete. Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`,
      );
    } catch (error) {
      this.logger.error('Error running wallet migration', error);
      throw error;
    }
  }


}
