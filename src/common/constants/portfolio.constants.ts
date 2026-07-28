// Alchemy Portfolio / Data API — token balances by address (multi-network).
export const PORTFOLIO_API_BASE = 'https://api.g.alchemy.com/data/v1';

// Follow at most this many pages of the by-address response (100 tokens/page)
// so a spam-flooded address can't trigger unbounded sequential calls.
export const PORTFOLIO_PAGE_CAP = 3;

// Force a full 7-network refresh at least this often so idle chains' USD
// prices don't drift forever between per-chain incremental updates.
export const PORTFOLIO_FULL_REFRESH_MS = 24 * 60 * 60 * 1000; // 24h

// Request-side network slugs sent to Alchemy for a full sync.
export const ALL_REQUEST_SLUGS = [
  'eth-mainnet',
  'bnb-mainnet',
  'polygon-mainnet',
  'arb-mainnet',
  'base-mainnet',
  'avax-mainnet',
  'opt-mainnet',
];

// Webhook network prefix (body.event.network.split('_')[0]) ->
//   request:  slug to SEND to Alchemy
//   response: slug Alchemy RETURNS (and we store) — Polygon is asymmetric.
export const NETWORK_MAP: Record<string, { request: string; response: string }> = {
  ETH: { request: 'eth-mainnet', response: 'eth-mainnet' },
  BNB: { request: 'bnb-mainnet', response: 'bnb-mainnet' },
  MATIC: { request: 'polygon-mainnet', response: 'matic-mainnet' },
  POL: { request: 'polygon-mainnet', response: 'matic-mainnet' },
  ARB: { request: 'arb-mainnet', response: 'arb-mainnet' },
  BASE: { request: 'base-mainnet', response: 'base-mainnet' },
  AVAX: { request: 'avax-mainnet', response: 'avax-mainnet' },
  OPT: { request: 'opt-mainnet', response: 'opt-mainnet' },
  OP: { request: 'opt-mainnet', response: 'opt-mainnet' },
};

// Native coin metadata by RESPONSE slug — the API returns null metadata for
// native tokens, so we fill symbol/decimals ourselves (all EVM natives = 18).
export const NATIVE_TOKEN: Record<string, { symbol: string; decimals: number }> = {
  'eth-mainnet': { symbol: 'ETH', decimals: 18 },
  'bnb-mainnet': { symbol: 'BNB', decimals: 18 },
  'matic-mainnet': { symbol: 'POL', decimals: 18 },
  'arb-mainnet': { symbol: 'ETH', decimals: 18 },
  'base-mainnet': { symbol: 'ETH', decimals: 18 },
  'avax-mainnet': { symbol: 'AVAX', decimals: 18 },
  'opt-mainnet': { symbol: 'ETH', decimals: 18 },
};
