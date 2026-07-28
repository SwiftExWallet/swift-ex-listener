import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';

export enum PortfolioSyncStatus {
  idle = 'idle',
  syncing = 'syncing',
  failed = 'failed',
}

@Schema({ _id: false })
export class PortfolioToken {
  @Prop({ required: true })
  network: string;

  @Prop({ type: String, default: null })
  tokenAddress: string | null;

  @Prop({ type: String, default: null })
  symbol: string | null;

  @Prop({ type: String, default: null })
  name: string | null;

  @Prop({ type: Number, default: null })
  decimals: number | null;

  @Prop({ type: String, default: null })
  logo: string | null;

  @Prop({ required: true })
  balanceHex: string;

  @Prop({ type: String, default: null })
  balance: string | null;

  @Prop({ type: String, default: null })
  priceUsd: string | null;

  @Prop({ type: String, default: null })
  valueUsd: string | null;
}
export const PortfolioTokenSchema =
  SchemaFactory.createForClass(PortfolioToken);

@Schema({ timestamps: true })
export class Portfolio {
  _id: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Device', required: true })
  deviceId: mongoose.Schema.Types.ObjectId;

  @Prop({ type: String, required: true })
  address: string;

  @Prop({ type: Boolean, default: false })
  stale: boolean;

  @Prop({
    type: String,
    enum: PortfolioSyncStatus,
    default: PortfolioSyncStatus.idle,
  })
  syncStatus: PortfolioSyncStatus;

  @Prop({ type: [PortfolioTokenSchema], default: [] })
  tokens: PortfolioToken[];

  @Prop({ type: String, default: '0' })
  totalValueUsd: string;

  @Prop({ type: Date, default: null })
  lastSyncedAt: Date | null;

  // When a full 7-network sync last ran. Drives the periodic full refresh so
  // idle chains' prices don't drift; incremental (single-chain) syncs leave
  // this untouched.
  @Prop({ type: Date, default: null })
  lastFullSyncAt: Date | null;

  @Prop({ type: String, default: null })
  lastSyncError: string | null;
}

export const PortfolioSchema = SchemaFactory.createForClass(Portfolio);

// identity: one portfolio document per (device, address)
PortfolioSchema.index({ deviceId: 1, address: 1 }, { unique: true });
// address-scoped invalidation (e.g. from a future balance-change webhook) can't rely on the
// compound index above since it doesn't lead with address
PortfolioSchema.index({ address: 1 });
// background staleness sweep
PortfolioSchema.index({ stale: 1, lastSyncedAt: 1 });
