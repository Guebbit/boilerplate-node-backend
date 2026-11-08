---
source: src/infrastructure/persistence/external-key-query.ts
sha256: 6704500e914e5864f3d6bf22c75b9e5134a5428bea70059cfad28df0f7bf343a
generated_at: 2026-11-08T03:42:35.216914+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/external-key-query.ts

## Purpose

Defines a single reusable Mongoose query option that enables `sanitizeFilter` for any lookup keyed by an externally-supplied value (provider reference, email, federated identity). It acts as a second, per-query guard—behind Zod validation at the edge—against filter-injection where a `$`-prefixed key in a nested object would be misread as a MongoDB operator (e.g. `{ "$ne": null }` matching everything instead of a literal string).

## Key elements

- **`EXTERNAL_KEY_QUERY`** (`{ sanitizeFilter: true } as const`) — The only export. Spread or passed into any Mongoose query options object to activate `sanitizeFilter` for that single query.

## Relationships

- **`src/modules/payments/repository.ts`** — Consumes `EXTERNAL_KEY_QUERY` when querying payments by an externally-supplied key (e.g. provider reference).
- **`src/modules/users/repository.ts`** — Consumes `EXTERNAL_KEY_QUERY` when querying users by an externally-supplied key (e.g. email or federated identity).

## Notes

- This is **per-query**, not a global Mongoose setting. Every query that matches on an outsider-supplied value must include it explicitly; forgetting it re-opens the injection path.
- A filter that legitimately needs MongoDB operators (e.g. `$in`, `$regex`) will have them neutralized by `sanitizeFilter`. Such operators must be wrapped with Mongoose's `trusted()` helper to retain their meaning.
- Zod schema validation at the API boundary remains the primary defense; this option is the safety net at the persistence layer.
