---
source: src/modules/account/two-factor/delivered-codes.ts
sha256: 57fd9c9f1fcfaf558876e72a48b669b5bd403c49b31d5919c7b7a935fba24b44
generated_at: 2026-11-08T04:52:01.354854+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/delivered-codes.ts

## Purpose

Pure logic for the short numeric codes a "delivered" two-factor method (e.g. email) produces: generation, hashing for at-rest storage, TTL/attempt/cooldown checks, and the final match/miss verdict. It reads and writes only an in-memory `DeliveredCodeState` entry — never the database — so the time-bound rules are testable against an injected clock.

## Key elements

- **`DELIVERED_CODE_DIGITS`, `DELIVERED_CODE_TTL_MS`, `DELIVERED_CODE_RESEND_SECONDS`, `DELIVERED_CODE_MAX_ATTEMPTS`** — exported constants sourced from `twoFactorRules` (generated from `rules.yaml`). 6 digits, 10-min TTL, configurable resend window, 5 max guesses.
- **`hashDeliveredCode(code)`** — HMAC-SHA256 using an HKDF subkey (info `"delivered-code"`) derived from the TOTP encryption keyring's `[0]` entry. Returns the hex digest stored in `entry.codeHash`.
- **`generateDeliveredCode()`** — zero-padded 6-digit string from `crypto.randomInt` (CSPRNG).
- **`deliveryCooldownRemaining(entry, now)`** — wraps the shared `cooldownRemaining` with this method's resend window.
- **`armDeliveredCode(entry, code, now)`** — stamps the hashed code, sent-at, expires-at, and resets attempt counter on the entry.
- **`DeliveredCodeVerdict`** — union type `'none' | 'expired' | 'match' | 'miss'`.
- **`checkDeliveredCode(entry, code, now)`** — pure comparison returning a verdict. Does **not** mutate the entry; spending the attempt counter is the caller's job.

## Relationships

- **`src/infrastructure/security/constant-time.ts`** — provides `constantTimeEqual`, used by `checkDeliveredCode` to avoid timing leaks during hash comparison.
- **`src/infrastructure/security/subkey.ts`** — provides `deriveSubkey`, used to derive the per-purpose HMAC key from the shared encryption key.
- **`src/modules/account/session/config.ts`** — provides `getTotpEncryptionKeyRing`, the source of the `[0]` key for HMAC derivation.
- **`src/modules/account/cooldown.ts`** — provides the shared `cooldownRemaining` helper that `deliveryCooldownRemaining` delegates to.
- **`src/modules/users/index.ts` / `src/modules/users/model.ts`** — defines the `DeliveredCodeState` type (fields: `codeHash`, `codeSentAt`, `codeExpiresAt`, `codeAttempts`) that this module reads and writes.
- **`src/modules/account/two-factor/delivered-code-verify.ts`** — the write-side companion: after `checkDeliveredCode` returns a verdict, that file performs the conditional DB write (spend the attempt, clear the code).
- **`src/modules/account/two-factor/methods/email.ts`** — the delivered method that calls `generateDeliveredCode` + `armDeliveredCode` and then sends the code.
- **`src/modules/account/services/two-factor-enrollment.ts`, `two-factor-outcomes.ts`, `reauth.ts`** — higher-level services that orchestrate the flow: enrollment triggers a delivery, reauth/verification consumes the verdict.
- **`src/modules/account/two-factor/index.ts`** — barrel re-export.
- **`src/modules/account/tests/unit/two-factor.test.ts`** — unit tests exercising the TTL, attempt, and cooldown paths with a fixed clock.

## Notes

- **Pure / no I/O.** This module never touches the database. The split into read (this file) vs. write (`delivered-code-verify.ts`) is deliberate: two parallel requests can both *read* the same entry, but only one can *conditionally write* (spend) it.
- **Single key, no rotation fallback.** The HMAC always uses keyring `[0]` (newest). A rotation mid-TTL-window invalidates the in-flight code — accepted trade-off, documented in `docs/tools/security.md`.
- **HMAC ≠ stretching.** The code space is only 10⁶; the HMAC exists so a leaked DB dump doesn't let an attacker brute-force codes offline. The real rate-limit is `MAX_ATTEMPTS` (5).
- **Injectable clock.** Every time-sensitive function accepts an optional `now: Date` parameter, defaulting to `new Date()`. Tests pass a fixed value.
- **Rules are generated.** All tunable constants come from `rules.generated.ts` (compiled from `rules.yaml`); do not hard-code values.
