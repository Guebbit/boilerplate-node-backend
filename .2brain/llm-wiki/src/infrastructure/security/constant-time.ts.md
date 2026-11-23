---
source: src/infrastructure/security/constant-time.ts
source_sha256: 1db0330b659d2eec9ab8466b826430ddf266f140ca58b341c573c537dd8ec28d
context_sha256: df18d915c3d9584b3d4c71887578dd3be201eb90c6f956ce4ff7b082aa7c684d
generated_at: 2026-11-22T03:08:30.986286+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/security/constant-time.ts

## Purpose
Provides a single constant-time string comparison primitive for checking static credentials (metrics scraper token, api-key hash, webhook signature, 2FA code). The module doc states these checks must not use `===`, which leaks how many leading bytes matched through response timing.

## Key elements
- `constantTimeEqual(a, b): boolean` — the only export. Returns whether two strings are equal by running `timingSafeEqual` on the SHA-256 digests of both inputs.
- `digestOf(value)` — private helper. Returns the 32-byte SHA-256 digest (`Buffer`) of a string using `node:crypto`.

## Relationships
- Consumed by (per the dependency graph):
  - `src/modules/account/services/two-factor-lockout.ts`
  - `src/modules/account/session/device-cookie.ts`
  - `src/modules/account/two-factor/delivered-codes.ts`
  - `src/modules/api-keys/credentials.ts`
  - `src/modules/observability/metrics-scraper.ts`
  - `src/modules/payments/providers/webhook-signature.ts`
- Tested by `tests/unit/infrastructure/security/constant-time.test.ts`.

## Notes
- Both inputs are hashed first, so the comparison always runs on two 32-byte buffers. This removes the length oracle: a `length === length && timingSafeEqual(...)` check would leak length equality through the `&&` short-circuit, and `timingSafeEqual` would throw on mismatched lengths.
- Only `string` inputs are accepted; there is no `Buffer` overload.
- The file's comment links to Paragon Initiative's double-HMAC article for the technique. The code uses a plain SHA-256 hash, not an HMAC.
