---
source: src/modules/account/two-factor/delivered-codes.ts
sha256: 57fd9c9f1fcfaf558876e72a48b669b5bd403c49b31d5919c7b7a935fba24b44
generated_at: 2026-10-29T03:06:59.008713+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/delivered-codes.ts

## Purpose

Pure (no I/O, no database) helper module for the short numeric codes that a "delivered" 2FA method (e.g. email) mints, stores as an HMAC, and checks against a user's typed input. It centralises the TTL, attempt-limit, and cooldown logic so those rules can be unit-tested against an injected clock without touching the persistence layer.

## Key elements

- **`DELIVERED_CODE_DIGITS`** – digit count (6), sourced from `twoFactorRules`.
- **`DELIVERED_CODE_TTL_MS`** – validity window for a code (10 min), exported for callers.
- **`DELIVERED_CODE_RESEND_SECONDS`** – minimum gap between two deliveries of the same method.
- **`DELIVERED_CODE_MAX_ATTEMPTS`** – online guesses allowed before a code is burned (5).
- **`hashDeliveredCode(code)`** – HMAC-SHA256 under an HKDF-derived subkey (`info: "delivered-code"`) of the TOTP encryption key ring's newest entry. Always uses ring index `[0]` (no multi-key decryption needed because a code never outlives one window).
- **`generateDeliveredCode()`** – zero-padded numeric code via `crypto.randomInt` (CSPRNG).
- **`deliveryCooldownRemaining(entry, now?)`** – delegates to the shared `cooldownRemaining` with this method's anchor and window.
- **`armDeliveredCode(entry, code, now?)`** – stamps a fresh code hash, timestamp, expiry, and resets the attempt counter on the in-memory entry.
- **`DeliveredCodeVerdict`** – union type: `'none' | 'expired' | 'match' | 'miss'`.
- **`checkDeliveredCode(entry, code, now?)`** – pure comparison; returns the verdict without mutating the entry (spending/counting is deferred to the caller's conditional write).

## Relationships

- **`rules.generated.ts`** – all policy constants (digits, TTL, resend window, max attempts) are read from `twoFactorRules.deliveredCodes`.
- **`constant-time.ts`** – `constantTimeEqual` is used in `checkDeliveredCode` for timing-safe comparison.
- **`subkey.ts`** – `deriveSubkey` produces the per-purpose HMAC key from the TOTP encryption key.
- **`session/config.ts`** – `getTotpEncryptionKeyRing` supplies the key material for hashing.
- **`cooldown.ts`** – `cooldownRemaining` is the shared cooldown arithmetic used by `deliveryCooldownRemaining`.
- **`users/index.ts` / `users/model.ts`** – provides the `DeliveredCodeState` shape that every function here reads and writes.
- **`delivered-code-verify.ts`** – the stateful layer that calls `checkDeliveredCode`, then performs the conditional write (increment attempts, clear hash on match/spend).
- **`methods/email.ts`** – the delivered-method implementation that mints codes via `generateDeliveredCode` and arms them via `armDeliveredCode`.
- **`index.ts`** – barrel re-export for the `two-factor` package.
- **`two-factor.test.ts`** – unit-tests the TTL, attempt, and cooldown behaviour with injected clocks.

## Notes

- `checkDeliveredCode` is intentionally **pure** (read-only). The "spend one attempt" or "clear the code" side-effects live in `delivered-code-verify.ts` as a conditional database write, preventing two parallel requests from both consuming the same code or double-counting a guess.
- Hashing always uses the key ring's **newest** key (`[0]`). A rotation mid-window invalidates any in-flight code (same trade-off as JWT rotation mid-refresh); there is no multi-key decryption path.
- All time-dependent functions accept an optional `now: Date` parameter, defaulting to `new Date()`, so tests can pin the clock.
- The HMAC (not the digest length) is the security boundary: six digits is only 10⁶ possibilities, so a plain SHA-256 would be pre-image-attackable from a dump. The HMAC key lives in the environment, not the database.
