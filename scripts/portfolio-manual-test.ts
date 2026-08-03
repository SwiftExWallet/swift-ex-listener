/**
 * Manual integration test for the portfolio sync (Layer 1).
 * Boots a minimal Nest context (Mongo + PortfolioModule only — no webhook/FCM
 * side effects), runs a FULL sync then an INCREMENTAL sync against the real
 * Portfolio API + DB using a SYNTHETIC device id, then cleans up.
 *
 * Run: npx ts-node -r dotenv/config scripts/portfolio-manual-test.ts
 */
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { PortfolioModule } from '../src/portfolio/portfolio.module';
import { PortfolioService } from '../src/portfolio/portfolio.service';
import { Portfolio } from '../src/portfolio/schema/portfolio.schema';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_CONN_STRING as string, {
      dbName: process.env.DB_NAME,
    }),
    PortfolioModule,
  ],
})
class TestModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(TestModule, {
    logger: ['error', 'warn', 'log'],
  });
  const svc = app.get(PortfolioService);
  const model = app.get(getModelToken(Portfolio.name));

  const deviceId = new mongoose.Types.ObjectId(); // synthetic — not a real device
  const inputAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // public test addr
  const address = inputAddress.toLowerCase(); // service stores lowercased — query/cleanup must match

  const summarize = (doc: any, label: string) => {
    if (!doc) return console.log(`\n[${label}] NO DOC`);
    const byNet: Record<string, number> = {};
    for (const t of doc.tokens) byNet[t.network] = (byNet[t.network] || 0) + 1;
    console.log(`\n[${label}]`);
    console.log('  syncStatus  :', doc.syncStatus);
    console.log('  tokens      :', doc.tokens.length, JSON.stringify(byNet));
    console.log('  totalUsd    :', doc.totalValueUsd);
    console.log('  lastSyncedAt:', doc.lastSyncedAt);
    console.log('  lastFullSync:', doc.lastFullSyncAt);
    console.log('  lastError   :', doc.lastSyncError);
  };

  try {
    console.log('=== 1) FULL sync (no webhook network) ===');
    await svc.syncPortfolio(deviceId, inputAddress, undefined);
    let doc = await model.findOne({ deviceId, address }).lean();
    summarize(doc, 'after full');
    const fullTotal = doc?.totalValueUsd;
    const arbBefore = doc?.tokens.filter((t: any) => t.network === 'arb-mainnet').length;

    console.log('\n=== 2) INCREMENTAL sync (ARB only) ===');
    await svc.syncPortfolio(deviceId, inputAddress, 'ARB_MAINNET');
    doc = await model.findOne({ deviceId, address }).lean();
    summarize(doc, 'after incremental ARB');
    const arbAfter = doc?.tokens.filter((t: any) => t.network === 'arb-mainnet').length;
    const ethStillThere = doc?.tokens.some((t: any) => t.network === 'eth-mainnet');

    console.log('\n=== assertions ===');
    console.log('  full created a doc            :', !!fullTotal);
    console.log('  incremental kept eth-mainnet  :', ethStillThere, '(should be true — other chains untouched)');
    console.log('  arb rows before/after         :', arbBefore, '/', arbAfter, '(refreshed in place)');
    console.log('  syncStatus idle after both    :', doc?.syncStatus === 'idle');
  } finally {
    const del = await model.deleteOne({ deviceId, address });
    console.log('\n=== cleanup: deleted test doc(s):', del.deletedCount, '===');
    await app.close();
  }
}

main().catch((e) => {
  console.error('TEST ERROR:', e);
  process.exit(1);
});
