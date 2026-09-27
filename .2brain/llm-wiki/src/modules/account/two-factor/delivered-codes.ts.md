---
source: src/modules/account/two-factor/delivered-codes.ts
sha256: 8873de9f958dc72b793bd3089c26e91af196ed05327e665a8f16eb6f681136c9
generated_at: 2026-09-27T14:37:46.834249+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/delivered-codes.ts

## Purpose

Pure helper module for the "delivered" two-factor flow (e.g. email/SMS codes). It mints a 6-digit code, hashes it for storage, and enforces the TTL / attempt-count / resend-cooldown rules against a method-entry object. It never touches the database or a transport — the caller owns persistence and delivery.

## Key elements

- **`DELIVERED_CODE_DIGITS`** (6) — code length constant.
- **`DELIVERED_CODE_TTL_MS`** (10 min) — window a code stays valid.
- **`DELIVERED_CODE_RESEND_SECONDS`** (30 s) — minimum gap between deliveries of the same method.
- **`DELIVERED_CODE_MAX_ATTEMPTS`** (5) — wrong guesses before the in-flight code is burned.
- **`hashDeliveredCode(code)`** — HMAC-SHA256 (keyed with the newest ring key) → hex string stored in `entry.codeHash`.
- **`generateDeliveredCode()`** — CSPRNG (`node:crypto` `randomInt`), zero-padded 6-digit string.
- **`deliveryCooldownRemaining(entry, now?)`** — delegates to shared `cooldownRemaining`; returns seconds still to wait before a re-send is allowed.
- **`armDeliveredCode(entry, code, now?)`** — writes hash, `codeSentAt`, `codeExpiresAt`, resets `codeAttempts` on the entry.
- **`clearDeliveredCode(entry)`** — sets all four code fields to `undefined`.
- **`consumeDeliveredCode(entry, code, now?)`** — validates a typed code: checks expiry, does a constant-time hash comparison, clears on success, increments `codeAttempts` on failure (clears at ceiling). Returns `boolean`. Mutates `entry`; caller must persist.

## Relationships

- **`@modules/users`** — imports the `TwoFactorMethodRecord` type (the shape of the entry this module reads/writes).
- **`@infrastructure/security/constant-time`** — imports `constantTimeEqual` to compare the stored hash with the candidate hash in constant time.
- **`../session/config`** — imports `getTotpEncryptionKeyRing`; uses the newest (`[0]`) key as the HMAC secret.
- **`../cooldown`** — imports `cooldownRemaining` so the resend gate and the shared verification re-send use the same clock math.
- **`two-factor/index.ts`** — re-exports this module's public API for the rest of the two-factor subsystem.
- **`two-factor/methods/email.ts`** — delivery-method implementation that calls `generateDeliveredCode` / `armDeliveredCode` / `deliveryCooldownRemaining` when sending an email code.
- **`services/two-factor.ts`** — orchestration layer that invokes `consumeDeliveredCode` during the verify step and handles persistence.
- **`tests/unit/two-factor.test.ts`** — unit tests that exercise the TTL, attempt, and cooldown rules with an injected clock.

## Notes

- **Pure by design.** Every mutating function takes the entry object by reference and writes into it; no DB calls, no I/O. The caller is responsible for persisting the mutated entry.
- **HMAC, not a bare digest.** The code space is only 1 000 000; a plain SHA-256 would be trivially pre-computable from a DB dump. The HMAC key lives in the environment (key-ring), not in the database.
- **Always the newest key (`[0]`).** Because a delivered code's maximum lifetime (10 min) is shorter than any key-rotation window, there is never an "old ciphertext to decrypt." A rotation mid-window simply invalidates the in-flight code — the same trade documented for JWT session rotation.
- **Burning a code also clears `codeSentAt`.** After the 5th wrong guess the cooldown anchor is gone, so the caller *could* immediately re-send. The actual cap on how many replacements one challenge allows is the separate `mfaSendLimiter`, not this module.
- **`now` is injectable.** Every time-dependent function defaults to `new Date()` but accepts a `Date` parameter, enabling deterministic tests.
