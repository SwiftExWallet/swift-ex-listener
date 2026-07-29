// Content-based spam filter for ERC-20 airdrop scams. Deliberately LIGHT: it
// only flags unambiguous scam signals (links, telegram handles, scam-CTA
// phrases, decorative emoji) and has NO structural rules, so legit tokens whose
// name has spaces or is long ("USD Coin", "Tether USD", "Yield App", "1inch
// Network") pass through easily. Safe to run on BOTH the symbol and the name.
export function isSpamToken(text: unknown): boolean {
  if (text == null) return false;
  const s = String(text).trim();
  if (!s) return false;

  // 1. Explicit links / telegram handles — unambiguous scam markers.
  if (/https?:\/\/|www\.|t\s*\.\s*me|t\s*\.\s*ly/i.test(s)) return true;

  // 2. Domain names using TLDs that legit token names essentially never use
  //    (deliberately excludes .com/.io/.finance/etc. to avoid false positives
  //    like "yearn.finance").
  if (/[a-z0-9-]+\.(cfd|club|rest|top|xyz|vip|icu|fun|monster|sbs|lol|site|online|shop|live|gift|space|website|win|tg|link|store|claim|pro|cc)\b/i.test(s)) return true;

  // 3. High-confidence scam call-to-action phrases (kept tight to avoid legit
  //    names — no bare "reward"/"claim"/"visit"/"unlock").
  if (/\b(airdrop|giveaway|voucher|redeem)\b|reward\s*pool|rewards?\s*unlocked|visit\s*to|to\s*claim|to\s*be\s*claimed|claim\s*your|swap\s*:/i.test(s)) return true;

  // 4. Decorative emoji / symbols — real token symbols and names never use these.
  //    Arrows (2190-21FF), dingbats incl. checkmark (2600-27BF), misc symbols
  //    incl. star (2B00-2BFF), variation selectors (FE00-FE0F), and emoji planes.
  if (/[←-⇿☀-➿⬀-⯿︀-️]/.test(s)) return true;
  if (/[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]/u.test(s)) return true;

  return false;
}
