# SwiftEx Listener

Real-time, multi-chain transaction listener and push-notification service for the [SwiftEx](https://swiftexchange.io) wallet.

It watches on-chain activity across EVM chains and Stellar, resolves each event to the user's device, and delivers push notifications through Firebase Cloud Messaging. It also keeps a Redis address→device index in sync and maintains per-wallet portfolio data.

## Features

- **Multi-chain EVM listening** — ingests Alchemy Address Activity webhooks (Ethereum, Polygon, BSC, Arbitrum, Avalanche, Optimism, Base) and notifies on incoming/outgoing transfers, swaps, and native swap payouts (internal transfers), with per-transaction de-duplication.
- **Stellar listening** — processes Horizon/Stellar activity (payments, trades, trustlines) and notifies the owning device.
- **Push notifications** — single and bulk delivery via Firebase Cloud Messaging (`sendEachForMulticast`), including a protected bulk endpoint.
- **Address → device index** — a Redis map so on-chain events resolve to the correct device's FCM token in real time.
- **Wallet & device registry** — MongoDB-backed store of wallets (EVM + Stellar addresses) and their devices.
- **Portfolio sync** — pulls token balances via the Alchemy Portfolio/Prices APIs and persists them per wallet.
- **JWT-protected admin routes** — internal endpoints (e.g. Redis address updates, bulk notifications) guarded by a shared JWT secret.

## Architecture

Built with [NestJS](https://nestjs.com/). Each concern is a self-contained module:

| Module | Responsibility |
|---|---|
| `block-listener` | Ingests EVM webhooks and emits notification events |
| `stellar` | Handles Stellar/Horizon activity |
| `notification` | Firebase Cloud Messaging delivery (single + bulk) |
| `device` | Device registration and FCM token resolution |
| `wallet` | Wallet address registry (EVM + Stellar) |
| `portfolio` | Token balance sync and storage |
| `redis` | Address → device/FCM index |
| `auth` | JWT authentication guard |
| `aml` | AML / screening support |
| `common` | Shared utilities, constants, enums, interfaces |

## Tech stack

- **Runtime:** Node.js + NestJS 11
- **Database:** MongoDB (Mongoose)
- **Cache/index:** Redis (ioredis)
- **Notifications:** Firebase Admin SDK (FCM)
- **Chains:** ethers / web3 (EVM), `@stellar/stellar-sdk` (Stellar), Alchemy (webhooks, RPC, data APIs)

## Getting started

### Prerequisites

- Node.js 18+
- A MongoDB instance
- A Redis instance
- Firebase service-account credentials
- Alchemy API access (webhooks + RPC/data keys)

### Install

```bash
npm install
```

### Configure

Create a `.env` file in the project root. Key variables:

```bash
# Server
PORT=3000

# Database
MONGODB_CONN_STRING=mongodb+srv://...
DB_NAME=your-db-name

# Auth
JWT_SECRET=your-shared-secret

# Redis
REDIS_URL=redis://localhost:6379

# Chain access (Alchemy)
SWIFTEX_PORTFOLIO_API=your-alchemy-key
ETH_WS_URL=wss://eth-mainnet.g.alchemy.com/v2/...
BSC_WS_URL=wss://bnb-mainnet.g.alchemy.com/v2/...
RPC_STELLAR=https://horizon.stellar.org

# Alchemy webhooks (per chain)
ALCHEMY_WEBHOOK1_ACCESS=...
ALCHEMY_WEBHOOKID_ETH=...
ALCHEMY_WEBHOOKID_POL=...
# ...one per chain

# Firebase (service account)
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

> Never commit secrets. Keep `.env` and service-account files out of version control.

### Run

```bash
# development (watch mode)
npm run start:dev

# production
npm run build
npm run start:prod
```

## Scripts

| Command | Description |
|---|---|
| `npm run start:dev` | Start in watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build |
| `npm run lint` | Lint and auto-fix |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |

## Project structure

```
src/
├── block-listener/   # EVM webhook ingestion + notification events
├── stellar/          # Stellar/Horizon activity
├── notification/     # Firebase Cloud Messaging (single + bulk)
├── device/           # Device registry + FCM tokens
├── wallet/           # Wallet address registry
├── portfolio/        # Token balance sync
├── redis/            # Address → device index
├── auth/             # JWT guard
├── aml/              # AML / screening
├── common/           # Shared utils, constants, enums, interfaces
├── app.module.ts
└── main.ts
```

## License

Licensed under the **Apache License 2.0**. See [LICENSE](./LICENSE) for the full text.
