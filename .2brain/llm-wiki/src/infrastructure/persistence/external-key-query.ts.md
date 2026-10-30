---
source: src/infrastructure/persistence/external-key-query.ts
sha256: 6704500e914e5864f3d6bf22c75b9e5134a5428bea70059cfad28df0f7bf343a
generated_at: 2026-10-29T02:12:38.041505+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/external-key-query.ts

## Purpose

Provides a pre-built Mongoose query option (`{ sanitizeFilter: true }`) to be spread into lookups that are keyed by a value an external party supplied (provider reference, email, federated identity). It acts as a second, per-query guard—behind Zod validation at the API edge—so that a filter object like `{ "$ne": null }` placed where a scalar is expected matches nothing rather than everything.

## Key elements

- **`EXTERNAL_KEY_QUERY`** (exported `const`) — A frozen object `{ sanitizeFilter: true } as const`. Spread or passed as the query option on Mongoose lookups that accept externally-sourced key values. Enables Mongoose's per-query `sanitizeFilter`, which wraps any nested object under a `$`-prefixed key with `$eq`.

## Relationships

- **`src/modules/payments/repository.ts`** — Consumes `EXTERNAL_KEY_QUERY` as the query option on lookups keyed by a provider-supplied reference.
- **`src/modules/users/repository.ts`** — Consumes `EXTERNAL_KEY_QUERY` on lookups keyed by an email or federated identity value.

## Notes

- This is **per-query**, not a global Mongoose setting. It applies only to the specific queries that include it.
- Filters that genuinely need operators (e.g., `$in`, `$regex`) will be neutralized by `sanitizeFilter`. Those must wrap the expression with `trusted()` from Mongoose to preserve operator semantics.
- Zod at the API boundary remains the primary validation layer; this option is a defense-in-depth measure for the persistence layer specifically.
