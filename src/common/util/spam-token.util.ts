// Content-based spam filter for ERC-20 airdrop scams. Deliberately LOOSE: it
// flags only the UNMISTAKABLE scam markers (links, telegram handles, scam
// TLDs, decorative emoji). No keyword/CTA rules and no structural rules, so
// legit tokens pass easily and only obviously-scam names are dropped. Safe to
// run on BOTH the symbol and the name.
export function isSpamToken(text: unknown): boolean {
  if (text == null) return false;
  const s = String(text).trim();
  if (!s) return false;

  // 1. Explicit links / telegram handles — unambiguous scam markers.
  if (/https?:\/\/|www\.|t\s*\.\s*me|t\s*\.\s*ly/i.test(s)) return true;

  // 2. Domain names using TLDs that legit token names essentially never use.
  if (/[a-z0-9-]+\.(cfd|club|rest|top|xyz|vip|icu|fun|monster|sbs|lol|gift|claim)\b/i.test(s)) return true;

  // 3. Decorative emoji / symbols — real token symbols and names never use these.
  //    Arrows (2190-21FF), dingbats incl. checkmark (2600-27BF), misc symbols
  //    incl. star (2B00-2BFF), variation selectors (FE00-FE0F), and emoji planes.
  if (/[←-⇿☀-➿⬀-⯿︀-️]/.test(s)) return true;
  if (/[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]/u.test(s)) return true;

  return false;
}
