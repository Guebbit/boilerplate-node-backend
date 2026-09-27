---
source: src/infrastructure/security/constant-time.ts
sha256: 1db0330b659d2eec9ab8466b826430ddf266f140ca58b341c573c537dd8ec28d
generated_at: 2026-09-27T14:16:24.827542+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/constant-time.ts

## Purpose

Provides a single `constantTimeEqual` primitive for comparing two strings in constant time, eliminating the timing side-channel that a plain `===` or length-check would leak. Every static-credential verification in the repo routes through this function rather than hand-rolling its own comparison.

## Key elements

- **`constantTimeEqual(a: string, b: string): boolean`** (exported) — SHA-256-hashes both inputs to fixed 32-byte digests, then calls Node's `timingSafeEqual` on the digests. Returns `true` only when the two strings are identical.
- **`digestOf(value: string): Buffer`** (module-internal) — Computes a SHA-256 digest, normalising variable-length inputs to a constant 32-byte Buffer before comparison.

## Relationships

- **Consumers** (all import `constantTimeEqual` for their credential/signature checks):
  - `src/modules/account/services/two-factor.ts` / `src/modules/account/two-factor/delivered-codes.ts` — 2FA code verification.
  - `src/modules/api-keys/credentials.ts` — API-key hash comparison.
  - `src/modules/observability/metrics-scraper.ts` — scraper bearer-token check.
  - `src/modules/payments/providers/webhook-signature.ts` — inbound webhook signature validation.
- **`tests/unit/infrastructure/security/constant-time.test.ts`** — unit tests covering the comparison logic.

## Notes

- The double-hash (SHA-256 before `timingSafeEqual`) is intentional: it removes the length oracle that a `a.length === b.length && timingSafeEqual(a, b)` pattern would leak. Do not "simplify" by comparing raw Buffers directly.
- The file has no runtime dependencies beyond `node:crypto`; it is safe to import anywhere.
- The JSDoc references the Paragonie "Double HMAC" strategy; the implementation uses a single SHA-256 pass rather than HMAC, which is sufficient for the non-adversarial-key scenarios in this repo.
