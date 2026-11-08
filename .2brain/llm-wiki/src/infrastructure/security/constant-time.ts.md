---
source: src/infrastructure/security/constant-time.ts
sha256: 1db0330b659d2eec9ab8466b826430ddf266f140ca58b341c573c537dd8ec28d
generated_at: 2026-11-08T03:48:43.369948+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/constant-time.ts

## Purpose

Provides the single constant-time string-comparison primitive used by every static-credential check in the repository. It exists so that callers never fall back to `===`, which leaks the count of matching leading bytes through response-timing side channels.

## Key elements

- **`constantTimeEqual(a: string, b: string): boolean`** (exported) — Compares two strings in constant time by SHA-256-hashing each into a fixed 32-byte digest, then passing the digests to `crypto.timingSafeEqual`. Returns `true` only when the hashes (and therefore the inputs) are identical.
- **`digestOf(value: string): Buffer`** (module-private) — SHA-256 helper that normalises any-length input to a 32-byte `Buffer`, eliminating the length oracle that a naive `a.length === b.length &&` guard would introduce.

## Relationships

- **`src/modules/account/two-factor/delivered-codes.ts`** — consumes `constantTimeEqual` to verify a user-submitted 2FA code against the stored/delivered value.
- **`src/modules/account/services/two-factor-lockout.ts`** — relies on constant-time comparison when evaluating credential state during lockout flows.
- **`src/modules/account/session/device-cookie.ts`** — uses the primitive to validate device/session tokens without timing side-channels.
- **`src/modules/api-keys/credentials.ts`** — compares presented API-key hashes against stored values via this helper.
- **`src/modules/observability/metrics-scraper.ts`** — authenticates the scraper by comparing its bearer token in constant time.
- **`src/modules/payments/providers/webhook-signature.ts`** — validates inbound webhook signatures using `constantTimeEqual`.
- **`tests/unit/infrastructure/security/constant-time.test.ts`** — unit-tests equality, inequality, and mixed-length inputs.

## Notes

- The double-hash strategy follows the Paragonie "double-HMAC" approach: both inputs are always reduced to 32 bytes *before* `timingSafeEqual` is called, so the function never branches on input length and `timingSafeEqual` never throws for mismatched sizes.
- This module is intentionally the **only** place in the codebase that should be used for comparing secrets, tokens, signatures, or one-time codes. If you find a `===` against a credential elsewhere, replace it with `constantTimeEqual`.
