// Heuristic spam filter for ERC-20 airdrop scams whose symbol/name is the
// scam payload (URLs, "claim/reward" CTAs, or structural anomalies a real
// token symbol never has). Returns true => drop it.
export function isSpamToken(symbol: unknown): boolean {
  if (symbol == null) return false; // missing symbol => native/unknown, not spam by this rule
  const s = String(symbol).trim();
  if (!s) return false;

  // 1. Explicit URLs
  if (/https?:\/\/|www\./i.test(s)) return true;

  // 2. Any domain-like token: <name>.<tld>
  if (/[a-z0-9-]+\.(com|net|org|io|xyz|tg|me|vip|app|fi|finance|site|club|online|shop|link|live|gift|top|cc|info|pro|gg|co|us|ly|ru|world|cash|money|win|fun|icu|art|store|space|website)\b/i.test(s)) return true;
  if (/t\.me\b/i.test(s)) return true;

  // 3. Scam call-to-action keywords
  if (/\b(claim|reward|rewards|airdrop|voucher|visit|redeem|bonus|giveaway|winner|access|telegram|earn|free|swap\s*now|congratulat)\b/i.test(s)) return true;

  // 4. Structural anomalies — real symbols are short, single-token, alnum-ish
  if (s.length > 20) return true;              // e.g. USDT, WETH are <=11
  if (/\s/.test(s)) return true;               // symbols never contain spaces
  if (/[^\p{L}\p{N}$._-]/u.test(s)) return true; // emoji / punctuation / non-standard chars

  return false;
}
