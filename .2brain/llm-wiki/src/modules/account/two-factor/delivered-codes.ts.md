---
source: src/modules/account/two-factor/delivered-codes.ts
sha256: 436e88b63715de65bb9eae70c21207ee94d02f9bd6fd3e78f5b52569a30fff4d
generated_at: 2026-10-15T10:16:57.885359+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/delivered-codes.ts

## Purpose

Pure helper module for the short 6-digit codes that "delivered" two-factor methods (e.g. email) send to a user. It mints codes, defines their stored HMAC form, and evaluates whether a typed code is still valid — all against an injectable clock and a mutable method-entry object, with no database access, so TTL/attempt/cooldown logic is unit-testable in isolation.

## Key elements

- **Constants** — `DELIVERED_CODE_DIGITS` (6), `DELIVERED_CODE_TTL_MS` (10 min), `DELIVERED_CODE_RESEND_SECONDS` (30 s), `DELIVERED_CODE_MAX_ATTEMPTS` (5).
- **`hashDeliveredCode(code)`** — returns the hex HMAC-SHA256 to store in `entry.codeHash`. Key is `deriveSubkey(ring[0].key, 'delivered-code')`, i.e. an HKDF subkey of the newest TOTP encryption-ring key.
- **`generateDeliveredCode()`** — produces a zero-padded 6-digit string from `crypto.randomInt`.
- **`deliveryCooldownRemaining(entry, now?)`** — delegates to shared `cooldownRemaining` with the 30 s resend window; returns seconds left (0 = may send).
- **`armDeliveredCode(entry, code, now?)`** — writes hash, timestamp, expiry, and resets attempt counter onto the entry.
- **`DeliveredCodeVerdict`** — union type: `'none' | 'expired' | 'match' | 'miss'`.
- **`checkDeliveredCode(entry, code, now?)`** — read-only comparison. Returns `'none'` when no code is armed or attempts are exhausted, `'expired'` past TTL, otherwise a constant-time HMAC match/miss. Does **not** mutate the entry; spending is the caller's job.

## Relationships

- **`@infrastructure/security/constant-time`** — `constantTimeEqual` prevents timing side-channels in the code comparison.
- **`@infrastructure/security/subkey`** — `deriveSubkey` scopes the TOTP ring key to a single-purpose HMAC key.
- **`@modules/account/session/config`** — `getTotpEncryptionKeyRing` supplies the key material; only index `[0]` (newest) is ever used.
- **`@modules/account/cooldown`** — `cooldownRemaining` provides the shared anchor-and-window math for the 30 s resend gate.
- **`@modules/users`** — the `DeliveredCodeState` type that every function reads/writes.
- **`./delivered-code-verify.ts`** — the sibling module that performs the conditional write (incrementing attempts, clearing the code) after `checkDeliveredCode` returns a verdict; this file deliberately stays read-only so two parallel requests can't double-spend.
- **`./index.ts`** — barrel re-export for the two-factor sub-package.
- **`./methods/email.ts`** — the email delivery method calls `generateDeliveredCode` / `armDeliveredCode` when sending.
- **`services/reauth.ts`, `services/two-factor-outcomes.ts`** — upstream services that invoke `checkDeliveredCode` and act on the verdict.
- **`tests/unit/two-factor.test.ts`** — exercises the TTL, attempt, and cooldown logic with a fixed clock.

## Notes

- **Never persists across key rotation.** Because a code's lifetime (10 min) is shorter than any rotation window, only the newest ring key is used; a rotation mid-window simply invalidates the in-flight code (same trade-off as JWT session rotation).
- **HMAC, not hashing, is the security control.** The comment explicitly states this is blast-radius reduction (key out of the DB), not entropy stretching. The real brute-force cap is `DELIVERED_CODE_MAX_ATTEMPTS = 5`.
- **`checkDeliveredCode` is intentionally side-effect-free.** Spending the attempt counter and clearing the code must go through `delivered-code-verify.ts`'s conditional write to avoid TOCTOU races under concurrent requests.
- **Clock injection.** Every time-sensitive function accepts an optional `now: Date`, defaulting to `new Date()`, so tests can pin the clock without mocking globals.
