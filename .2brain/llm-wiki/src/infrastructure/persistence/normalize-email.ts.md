---
source: src/infrastructure/persistence/normalize-email.ts
sha256: 2a548f603679856be6330aa0ccab61929ce717d68fd37dd4d15a3d05b5e579fe
generated_at: 2026-09-27T14:14:32.474068+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/normalize-email.ts

## Purpose

Single source of truth for email normalisation in the app: trim then lowercase. Every code path that stores, looks up, or compares an email address funnels through this one function so that two different casings of the same address can never be treated as distinct users or rate-limit keys (PL-29).

## Key elements

- **`normalizeEmail(email: string): string`** — The sole export. Trims whitespace and lowercases the input. Pure, no side effects.

## Relationships

- **`src/modules/users/model.ts`** — Uses `normalizeEmail` as the schema-level cast for the user email field, so persisted and queried values are always normalised identically to login lookups.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Keys its per-address budget on the normalised email, preventing casing variations from bypassing or fragmenting the limit.
- **`src/modules/account/services/profile.ts`**, **`src/modules/account/routes.ts`**, **`src/modules/feedback/service.ts`**, **`src/modules/orders/repository.ts`** — Call `normalizeEmail` before storing or comparing the submitted address in their own operations.
- **`tests/unit/infrastructure/persistence/normalize-email.test.ts`** — Unit tests covering the trim + lowercase behaviour.
- **`src/modules/users/tests/integration/model.test.ts`** — Exercises the schema-level cast indirectly through the users model.

## Notes

- This is intentionally the *only* normalisation step. Do not add additional transforms (IDN punycode, plus-alias stripping, etc.) here without a coordinated change to every consumer.
- The function lives under `infrastructure/persistence/` because it was introduced alongside the persistence layer, but it is a general-purpose utility imported across modules.
- Order matters: trim **then** lowercase. Swapping the order would not change the output for this operation set, but the documented contract is "trim, then lowercase."
