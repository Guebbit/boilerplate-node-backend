---
source: tests/support/ids.ts
sha256: 28372ab68003db0551cf91165f07d8f2d467bd97f969f6571cb94ac87eeb72ec
generated_at: 2026-09-27T16:00:26.750308+00:00
model: ollama:qwen3.8:27b
---

# tests/support/ids.ts

## Purpose

Provides a single shared test fixture constant representing a syntactically valid but guaranteed-absent MongoDB ObjectId. It exists so that "not found" test cases across all modules use the same obviously-fake ID rather than each inventing their own, avoiding accidental collisions with real documents a sibling test might seed.

## Key elements

- **`MISSING_ID`** (exported const) — `'f'.repeat(24)`, a 24-character string that satisfies ObjectId format but will never correspond to a seeded document. The `f`-only pattern is chosen so it is visually distinguishable at a glance from a realistic hex ObjectId.

## Relationships

- Imported by **contract tests** across `account`, `cart`, `feedback`, `inventory`, `locales`, `payments`, and `wishlist` modules — used in `findById` / `removeById` / route-param lookup scenarios to assert 404 or empty-response behavior.
- Imported by **integration tests** in `cart/service`, `feedback/service`, and `orders/service-crud` for the same "document does not exist" assertion pattern.

## Notes

- This is a *fake* ID, not a random one. Tests using it assert the **absence** path; they do not assert anything about a specific real document.
- Do not replace with `crypto.randomUUID()` or a random hex string — the whole point is that it is stable, shared, and unmistakably non-organic.
