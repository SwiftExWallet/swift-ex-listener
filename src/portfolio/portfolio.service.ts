import { Injectable, Logger } from '@nestjs/common';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioToken } from './schema/portfolio.schema';
import { isSpamToken } from '../common/util/spam-token.util';
import {
  PORTFOLIO_API_BASE,
  PORTFOLIO_PAGE_CAP,
  PORTFOLIO_FULL_REFRESH_MS,
  PORTFOLIO_MIN_VALUE_USD,
  ALL_REQUEST_SLUGS,
  NETWORK_MAP,
  NATIVE_TOKEN,
} from '../common/constants/portfolio.constants';

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(private readonly repo: PortfolioRepository) {}

  private get apiKey(): string | undefined {
    return process.env.SWIFTEX_PORTFOLIO_API;
  }

  /**
   * Refresh the on-chain portfolio for (device, address) after a received tx.
   * First time (or when the last full sync is older than the refresh window) we
   * fetch all 7 EVM networks; otherwise we fetch only the chain the webhook
   * fired on and merge it into the stored doc. Fire-and-forget — never throws.
   */
  async syncPortfolio(
    deviceId: any,
    address: string,
    webhookNetwork?: string,
  ): Promise<void> {
    if (!this.apiKey) {
      this.logger.error('SWIFTEX_PORTFOLIO_API not set — skipping portfolio sync');
      return;
    }
    const addr = String(address).toLowerCase();
    const existing = await this.repo.findByAddress(addr);

    const net = webhookNetwork ? this.mapNetwork(webhookNetwork) : null;
    const lastFull = existing?.lastFullSyncAt
      ? new Date(existing.lastFullSyncAt).getTime()
      : 0;
    const fullSync =
      !existing ||
      !lastFull ||
      Date.now() - lastFull > PORTFOLIO_FULL_REFRESH_MS ||
      !net; // unknown/missing chain => fall back to a full sync

    await this.repo.markSyncing(deviceId, addr);

    try {
      const requestNetworks = fullSync ? ALL_REQUEST_SLUGS : [net!.request];
      const raw = await this.fetchTokens(addr, requestNetworks);
      const fresh = this.mapTokens(raw);

      let tokens: PortfolioToken[];
      if (fullSync) {
        tokens = fresh;
      } else {
        // replace only the affected chain (matched by RESPONSE slug), keep the rest
        const kept = (existing!.tokens || []).filter(
          (t) => t.network !== net!.response,
        );
        tokens = [...kept, ...fresh];
      }

      const totalValueUsd = tokens
        .reduce((sum, t) => sum + (parseFloat(t.valueUsd || '0') || 0), 0)
        .toString();

      const now = new Date();
      await this.repo.saveResult(deviceId, addr, {
        tokens,
        totalValueUsd,
        lastSyncedAt: now,
        ...(fullSync ? { lastFullSyncAt: now } : {}),
      });
      this.logger.log(
        `portfolio ${fullSync ? 'full' : 'incremental'} synced ${addr} — ${tokens.length} tokens, $${totalValueUsd}`,
      );
    } catch (e: any) {
      await this.repo.markFailed(deviceId, addr, e?.message ?? String(e));
      this.logger.error(`portfolio sync failed ${addr}: ${e?.message ?? e}`);
    }
  }

  private mapNetwork(
    webhookNetwork: string,
  ): { request: string; response: string } | null {
    const prefix = String(webhookNetwork).split('_')[0].toUpperCase();
    return NETWORK_MAP[prefix] || null;
  }

  // POST /assets/tokens/by-address, following pageKey up to PORTFOLIO_PAGE_CAP.
  private async fetchTokens(
    address: string,
    networks: string[],
  ): Promise<any[]> {
    const url = `${PORTFOLIO_API_BASE}/${this.apiKey}/assets/tokens/by-address`;
    const all: any[] = [];
    let pageKey: string | undefined;

    for (let page = 0; page < PORTFOLIO_PAGE_CAP; page++) {
      const body: any = {
        addresses: [{ address, networks }],
        withMetadata: true,
        withPrices: true,
        includeNativeTokens: true,
        includeErc20Tokens: true,
      };
      if (pageKey) body.pageKey = pageKey;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Alchemy ${res.status}: ${txt.slice(0, 160)}`);
      }
      const json = await res.json();
      const tokens = json?.data?.tokens || [];
      all.push(...tokens);
      pageKey = json?.data?.pageKey;
      if (!pageKey) break;
    }
    return all;
  }

  private mapTokens(raw: any[]): PortfolioToken[] {
    const out: PortfolioToken[] = [];
    for (const t of raw) {
      const isNative = t.tokenAddress == null;
      const native = NATIVE_TOKEN[t.network];
      const symbol: string | null =
        t.tokenMetadata?.symbol ?? (isNative ? native?.symbol ?? null : null);
      const name: string | null = t.tokenMetadata?.name ?? null;

      // Drop airdrop-spam tokens (scam payload lives in the symbol or name).
      if (isSpamToken(symbol) || isSpamToken(name)) continue;

      const decimals: number | null =
        t.tokenMetadata?.decimals ??
        (isNative ? native?.decimals ?? 18 : null);
      const balanceHex: string = t.tokenBalance || '0x0';
      const balance = this.hexToDecimalString(balanceHex, decimals);
      const priceUsd: string | null = t.tokenPrices?.[0]?.value ?? null;
      const valueUsd =
        balance != null && priceUsd != null
          ? (parseFloat(balance) * parseFloat(priceUsd)).toString()
          : null;

      // Value filter: require a positive balance, then keep. Null-price tokens
      // are ALLOWED (Alchemy intermittently returns null for real tokens like
      // USDC/USDT — dropping them would hide real holdings). Only priced dust
      // below the floor is discarded.
      if (!this.isPositiveHex(balanceHex)) continue;
      if (!isNative && valueUsd != null && parseFloat(valueUsd) < PORTFOLIO_MIN_VALUE_USD) continue;

      out.push({
        network: t.network,
        tokenAddress: t.tokenAddress ?? null,
        symbol,
        name,
        decimals,
        logo: t.tokenMetadata?.logo ?? null,
        balanceHex,
        balance,
        priceUsd,
        valueUsd,
      });
    }
    return out;
  }

  private isPositiveHex(hex: string): boolean {
    try {
      return BigInt(hex) > 0n;
    } catch {
      return false;
    }
  }

  // hex wei-style balance -> human decimal string, using BigInt for precision.
  private hexToDecimalString(
    hex: string,
    decimals: number | null,
  ): string | null {
    try {
      const raw = BigInt(hex);
      const d = BigInt(decimals ?? 18);
      const base = 10n ** d;
      const whole = raw / base;
      const frac = raw % base;
      if (frac === 0n) return whole.toString();
      const fracStr = frac
        .toString()
        .padStart(Number(d), '0')
        .replace(/0+$/, '');
      return `${whole.toString()}.${fracStr}`;
    } catch {
      return null;
    }
  }
}
