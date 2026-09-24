---
source: src/infrastructure/security/constant-time.ts
sha256: 2c0ceaa193dac1f382347aabf885812be2e79283e6b315b5e01ec5632a33a449
generated_at: 2026-09-23T17:52:50.430146+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/constant-time.ts

## Purpose

Provides a single constant-time string comparison primitive (`constantTimeEqual`) so that every static-credential check in the repo (API-key hashes, scraper tokens) avoids leaking prefix-match information through response timing that a naive `===` would.

## Key elements

- **`constantTimeEqual(a: string, b: string): boolean`** — Compares two strings in constant time. Converts both to `Buffer`, checks that their lengths match, and only then calls `crypto.timingSafeEqual`. The length guard prevents `timingSafeEqual` from throwing (which would itself be a length oracle) and folds the result into a single boolean.

## Relationships

- **`src/modules/api-keys/credentials.ts`** — Consumer; uses `constantTimeEqual` for API-key hash verification instead of a direct string `===`.
- **`src/modules/observability/metrics-scraper.ts`** — Consumer; uses `constantTimeEqual` for the scraper token check.

## Notes

- The file lives under `infrastructure/security` deliberately: it is a shared primitive that callers must use rather than re-implementing the comparison inline.
- `timingSafeEqual` is **never** called when the two buffers differ in length; the `&&` short-circuit guarantees that. This is intentional — a thrown error on mismatch would leak length.
- Comparison is byte-wise (via `Buffer.from`), so it is sensitive to non-ASCII characters the same way a byte-level `===` would be; it is not a locale- or normalization-aware string equality.
