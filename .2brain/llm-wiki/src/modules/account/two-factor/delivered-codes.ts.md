---
source: src/modules/account/two-factor/delivered-codes.ts
sha256: 906d4c6f42fe051ee06e815ad650dabf0d9c30bbf4575f2354d5abc452323f26
generated_at: 2026-10-14T14:48:34.887168+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/delivered-codes.ts

## Purpose

Pure logic for the 6-digit codes a "delivered" 2FA method (e.g. email) sends: minting, hashing for storage, TTL/expiry, resend cooldown, attempt tracking, and the comparison that decides if a typed code is valid. It reads and writes a `DeliveredCodeState` entry in place but never touches the database, so TTL, cooldown, and attempt rules can be tested against an injected clock.

## Key elements

- **`DELIVERED_CODE_DIGITS`** — constant 6.
- **`DELIVERED_CODE_TTL_MS`** — 10 min acceptance window.
- **`DELIVERED_CODE_RESEND_SECONDS`** — 30 s minimum between sends (drives the client countdown).
- **`DELIVERED_CODE_MAX_ATTEMPTS`** — 5 wrong guesses before the code is burned.
- **`hashDeliveredCode(code)`** — HMAC-SHA256 under an HKDF-derived subkey (info `delivered-code`) of the newest ring key; returns the hex digest stored in `entry.codeHash`.
- **`generateDeliveredCode()`** — CSPRNG (`crypto.randomInt`) zero-padded 6-digit string.
- **`deliveryCooldownRemaining(entry, now?)`** — delegates to shared `cooldownRemaining`; returns seconds until the next send is allowed.
- **`armDeliveredCode(entry, code, now?)`** — stamps hash, timestamp, expiry, and resets attempt counter on the entry.
- **`clearDeliveredCode(entry)`** — sets all code fields to `undefined`.
- **`DeliveredCodeVerdict`** — union type `'none' | 'expired' | 'match' | 'miss'`.
- **`checkDeliveredCode(entry, code, now?)`** — pure comparison (constant-time). Returns a verdict; does **not** mutate the entry. Spending/counting is left to the caller's conditional write.

## Relationships

- **`@infrastructure/security/constant-time`** — `constantTimeEqual` is used in `checkDeliveredCode` to avoid timing side-channels on the hash comparison.
- **`@infrastructure/security/subkey`** — `deriveSubkey` derives the per-purpose HMAC key from the ring key.
- **`../session/config`** — `getTotpEncryptionKeyRing` supplies the encryption key ring; only `[0]` (newest) is used because a code's lifetime is too short to span a rotation.
- **`../cooldown`** — `cooldownRemaining` provides the shared anchor+window math for the 30 s resend gate.
- **`@modules/users`** — `DeliveredCodeState` is the shape this file reads/writes; defined in `src/modules/users/model.ts` and re-exported from `src/modules/users/index.ts`.
- **`./delivered-code-verify.ts`** — the write-side companion: performs the conditional DB updates (spend the code, increment attempts) that `checkDeliveredCode` deliberately leaves out.
- **`./index.ts`** — barrel that re-exports this module's public surface.
- **`./methods/email.ts`** — the delivery transport that calls `generateDeliveredCode` / `armDeliveredCode` and sends the digits to the user.
- **`src/modules/account/services/two-factor-challenge.ts`**, **`two-factor-enrollment.ts`**, **`reauth.ts`** — service-layer callers that orchestrate delivery + verification.
- **`src/modules/account/tests/unit/two-factor.test.ts`** — unit tests exercising the TTL, cooldown, attempt, and verdict paths with a fixed clock.

## Notes

- The file is intentionally **read-mostly / pure**: `checkDeliveredCode` returns a verdict but never mutates the entry. Concurrency safety (spending the code, counting a miss) is delegated to `delivered-code-verify.ts`, which issues a conditional DB write.
- `hashDeliveredCode` always uses ring entry `[0]`. Because a code lives at most 10 minutes, there is no need to decrypt against older keys after a key rotation — a code straddling a rotation simply becomes unverifiable, mirroring the JWT-mid-refresh trade-off.
- `codeAttempts` is a nullable number on the entry; `checkDeliveredCode` guards with `?? 0`.
- `armDeliveredCode` **replaces** any in-flight code; it does not append or queue.
