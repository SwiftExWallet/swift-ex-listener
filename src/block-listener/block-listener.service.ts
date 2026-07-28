import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { FirebaseNotificationService } from '../notification/notification.service';
import { WalletService } from '../wallet/wallet.service';
import {
  ALCHEMY_API_CREATEHOOK,
  ALCHEMY_NETWORK_ETH,
  WebhookConfig,
  ALCHEMY_GRAPHQL_QUERY_ETH,
  ALCHEMY_API_UPDATEHOOK,
} from '../common/constants/alchemy.constants';
import { OnEvent } from '@nestjs/event-emitter';
import { RateLimitService, AmlFlag } from './rate-limit.service';
import { SupportedWalletChain } from 'src/common/enum/chain.eum';
import { PortfolioService } from '../portfolio/portfolio.service';
import { isSpamToken } from '../common/util/spam-token.util';

@Injectable()
export class BlockListenerService {
  private readonly logger = new Logger(BlockListenerService.name);

  private baseUrl: string;

  private alchemyToken: string;

  private alchemyEventHookETH: string;

  private alchemyTokenMultichain: string;

  private isUpdateAllHooks: boolean;

  private isUpdateHookETH: boolean;

  private isUpdateRedis: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly notificationService: FirebaseNotificationService,
    private readonly walletService: WalletService,
    private readonly rateLimitService: RateLimitService,
    private readonly portfolioService: PortfolioService,
  ) {
    this.baseUrl = this.configService.get<string>('ALCHEMY_BASE_URL') || '/';
    this.alchemyToken =
      this.configService.get<string>('ALCHEMY_TOKEN') || 'NAN';
    this.isUpdateAllHooks =
      this.configService.get<string>('UPDATE_ADDRESS_ALL_ALCHEMY') === 'true';
    this.isUpdateHookETH =
      this.configService.get<string>('UPDATE_ADDRESS_ETH_ALCHEMY') === 'true';
    this.isUpdateRedis =
      this.configService.get<string>('IS_REDIS_INIT') === 'true';
    this.alchemyEventHookETH =
      this.configService.get<string>('ALCHEMY_EVENT_ETH_HOOK') || 'NAN';
    this.alchemyTokenMultichain =
      this.configService.get<string>('ALCHEMY_TOKEN_MULTICHAIN') || 'NAN';
  }

  async onModuleInit() {
    this.logger.log('Starting Alchemy log subscription...');

    const multiAddresses = await this.addWalletAddressToRedis();

    await this.createWebhook({
      network: ALCHEMY_NETWORK_ETH,
      webhookName: ALCHEMY_NETWORK_ETH,
      updateHookFlag: this.isUpdateHookETH,
      webhookCallbackURL: this.alchemyEventHookETH,
      graphQlQuery: ALCHEMY_GRAPHQL_QUERY_ETH,
      apiURL: ALCHEMY_API_CREATEHOOK,
    }, multiAddresses);
  }

  private getWebhookConfig(network: string): { webhookId: string | undefined; token: string | undefined } {
    const multichainToken = this.alchemyTokenMultichain;
    const map: Record<string, { webhookId: string | undefined; token: string | undefined }> = {
      ETH:  { webhookId: process.env.ALCHEMY_WEBHOOKID_ETH,  token: this.alchemyToken },
      BNB:  { webhookId: process.env.ALCHEMY_WEBHOOKID_BNB,  token: this.alchemyToken },
      OPT:  { webhookId: process.env.ALCHEMY_WEBHOOKID_OP,   token: multichainToken },
      BASE: { webhookId: process.env.ALCHEMY_WEBHOOKID_BASE,  token: multichainToken },
      ARB:  { webhookId: process.env.ALCHEMY_WEBHOOKID_ARB,   token: multichainToken },
      AVAX: { webhookId: process.env.ALCHEMY_WEBHOOKID_AVAX,  token: multichainToken },
      MATIC:{ webhookId: process.env.ALCHEMY_WEBHOOKID_POL,   token: multichainToken },
    };
    return map[network] ?? { webhookId: undefined, token: undefined };
  }

  private async createWebhook(config: WebhookConfig, addressKeys: string[]): Promise<void> {
    // ***** All hooks should be true to update any hook ******
    if (!this.isUpdateAllHooks || !config.updateHookFlag) return;

    const path: string = `${this.baseUrl}${config.apiURL}`;
    this.logger.log(`Creating New WebHook`);

    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'X-Alchemy-Token': this.alchemyToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        network: config.network,
        name: config.webhookName,
        webhook_type: 'ADDRESS_ACTIVITY',
        webhook_url: config.webhookCallbackURL,
        graphql_query: config.graphQlQuery,
        addresses: addressKeys,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new HttpException(`Alchemy error: ${error}`, response.status);
    }
    this.logger.log(
      ` === All Addresses Updated with Status ${response.status}`,
    );
  }

  private async updateWebhook(
    config: WebhookConfig,
    addressesToAdd: string[],
    addressesToRemove: string[] = [],
    token?: string,
  ): Promise<void> {
    const path: string = `${this.baseUrl}${config.apiURL}`;
    this.logger.log(`Updating Hook WebHook`);

    const response = await fetch(path, {
      method: 'PATCH',
      headers: {
        'X-Alchemy-Token': token ?? this.alchemyToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhook_id: config.webHookId,
        addresses_to_add: addressesToAdd,
        addresses_to_remove: addressesToRemove,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(error);
    }
  }

  async handleWebhookEvent(body: any) {
    this.logger.log(`Received webhook event from ${body.event?.network}`);
    const network = body.event.network.split('_')[0];

    const activities = body.event.activity || [];
    this.logger.log(`[DIAG] ${network} activities: ${JSON.stringify(activities.map(a => ({ to: a?.toAddress, cat: a?.category, val: a?.value, asset: a?.asset })))}`);

    let activity: any = null;
    let fcmToken: any = "";
    let deviceId: any = null;
    for (const a of activities) {
      if (!a?.toAddress) { this.logger.log(`[DIAG] skip: no toAddress`); continue; }
      if (a?.category === 'internal') { this.logger.log(`[DIAG] skip: internal ${a.toAddress}`); continue; } // simple transfers only — skip internal
      const normalizedValue =
  a.value ??
  (a.rawContract?.rawValue
    ? Number(a.rawContract.rawValue) /
      10 ** (a.rawContract.decimals || 18)
    : 0);

if (normalizedValue <= 0) { this.logger.log(`[DIAG] skip: value<=0 ${a.toAddress}`); continue; }

      // Airdrop-spam tokens encode the scam in their symbol/name
      // (e.g. "Claim 5000 USDC at xxx.tg"). Skip before the DB lookup so a
      // spam token can't shadow a legit transfer in the same batch.
      if (isSpamToken(a?.asset)) { this.logger.log(`[DIAG] skip: spam token "${a?.asset}" -> ${a.toAddress}`); continue; }

      const wallet = await this.walletService.findByMultiAddressWithDevice(a.toAddress);
      fcmToken = (wallet as any)?.deviceId?.fcmToken;
      this.logger.log(`[DIAG] lookup ${a.toAddress} -> wallet=${!!wallet} fcmToken=${fcmToken ? 'YES' : 'NO'}`);

      if (fcmToken) {
        activity = { ...a, normalizedValue };
        deviceId = (wallet as any)?.deviceId?._id;
        break;
      }
    }

    if (!activity || !fcmToken) { this.logger.warn(`[DIAG] BAIL — no matching wallet/token for ${network}`); return; }


    const fromAddress = activity.fromAddress;
    const toAddress = activity.toAddress;
    const isToken = activity?.category === 'token';
   const tokenType = isToken
  ? activity.asset ||
    `Token (${activity.rawContract?.address?.slice(0, 6) || ''}...)`
  : network;
    const value = activity.normalizedValue ?? activity.value ?? 0;
    const txHash = activity.hash;

    // --- AML / rate-limit / ban layers disabled — simple transfer notifications only ---
    // To re-enable, restore the isToAddressBanned / trackAndCheckFromAddress /
    // trackAndCheckToAddress blocks here.

    this.sendNotification(
      toAddress,
      tokenType,
      value,
      'Received: ',
      fromAddress,
      network,
      txHash,
      fcmToken,
    );

    // After notifying, refresh the on-chain portfolio for this device+address.
    // Fire-and-forget — the balance just changed on `body.event.network`, so the
    // service does a single-chain incremental sync (or a full sync the first
    // time / past the refresh window). Never blocks the webhook response.
    if (deviceId) {
      this.portfolioService
        .syncPortfolio(deviceId, toAddress, body.event.network)
        .catch((e) =>
          this.logger.error(`portfolio sync ${toAddress}: ${e?.message ?? e}`),
        );
    }
  }

  async sendNotification(
    address,
    tokenType,
    value,
    altText,
    from,
    network,
    txHash,
    fcmToken,
  ) {

    if (fcmToken) {
      const data: Record<string, string> = {
        network,
        txHash: String(txHash),
      };
      const title: string = `${altText} ${value}  ${tokenType} `;
      const body: string = `From ${from.slice(0, 6)}...${from.slice(-4)}`;

      if ([altText, value, tokenType].some(v => v == null)) return;
      await this.notificationService.sendNotification(fcmToken, {
        title,
        body,
        data,
      });
    }
  }

  @OnEvent('wallet.removed')
  async handleWalletRemove(payload) {
    const addresses = payload.addresses;

    await this.updateWebhook({ webHookId: process.env.ALCHEMY_WEBHOOKID_ETH, apiURL: ALCHEMY_API_UPDATEHOOK }, [], addresses);
    await this.updateWebhook({ webHookId: process.env.ALCHEMY_WEBHOOKID_BNB, apiURL: ALCHEMY_API_UPDATEHOOK }, [], addresses);

    const multichainWebhookIds = [
      process.env.ALCHEMY_WEBHOOKID_OP,
      process.env.ALCHEMY_WEBHOOKID_BASE,
      process.env.ALCHEMY_WEBHOOKID_AVAX,
      process.env.ALCHEMY_WEBHOOKID_POL,
      process.env.ALCHEMY_WEBHOOKID_ARB,
    ];
    for (const webhookId of multichainWebhookIds) {
      if (webhookId) await this.updateWebhook({ webHookId: webhookId, apiURL: ALCHEMY_API_UPDATEHOOK }, [], addresses, this.alchemyTokenMultichain);
    }
  }

  @OnEvent('wallet.updated')
  async handleWalletUpdateEth(payload) {
    const addresses = payload.addresses;

    // ETH + BNB
    await this.updateWebhook({ webHookId: process.env.ALCHEMY_WEBHOOKID_ETH, apiURL: ALCHEMY_API_UPDATEHOOK }, addresses);
    await this.updateWebhook({ webHookId: process.env.ALCHEMY_WEBHOOKID_BNB, apiURL: ALCHEMY_API_UPDATEHOOK }, addresses);

    // OP, BASE, AVAX, POL, ARB — shared multichain token
    const multichainWebhookIds = [
      process.env.ALCHEMY_WEBHOOKID_OP,
      process.env.ALCHEMY_WEBHOOKID_BASE,
      process.env.ALCHEMY_WEBHOOKID_AVAX,
      process.env.ALCHEMY_WEBHOOKID_POL,
      process.env.ALCHEMY_WEBHOOKID_ARB,
    ];
    for (const webhookId of multichainWebhookIds) {
      if (webhookId) await this.updateWebhook({ webHookId: webhookId, apiURL: ALCHEMY_API_UPDATEHOOK }, addresses, [], this.alchemyTokenMultichain);
    }
  }

  async addWalletAddressToRedis(): Promise<string[]> {
    if (!this.isUpdateRedis) return [];

    let limit = 200, offset = 0;
    const total = await this.walletService.totalXlmRecords();
    this.logger.log(`Total XLM wallets: ${total}`);

    while (true) {
      const records = await this.walletService.findAllXlmWithDevice(limit, offset);

      if (!records || records.length === 0) {
        this.logger.log('All XLM records processed');
        break;
      }

      const addressMapStellar: Record<string, string> = {};
      for (const record of records) {
        if (record?.addresses && record.deviceId) {
          const xlm = record.addresses.get(SupportedWalletChain.XLM);
          if (xlm) addressMapStellar[xlm] = record.deviceId.fcmToken;
        }
      }

      if (Object.keys(addressMapStellar).length > 0)
        await this.redisService.hSet(
          process.env.STELLAR_REDIS_KEY as string,
          addressMapStellar,
        );

      offset += limit;
    }
    return [];
  }
}
