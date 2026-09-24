---
source: src/infrastructure/persistence/serialize.ts
sha256: fc702319761696c083739bf7d06d426d806a9f750a87fc0128c8365338b77b21
generated_at: 2026-09-23T17:50:58.008692+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/serialize.ts

## Purpose

Centralizes the "stored document → API wire payload" transform so that both Mongoose's `toJSON` path and the `.lean()`/`.aggregate()` raw-BSON path produce identical output: `_id` renamed to `id` (or deleted), `__v` dropped, caller-named keys stripped, and any model-specific post-processing applied.

## Key elements

- **`SerializeTransform`** (type) — A function `(serialized: Record<string, unknown>) => Record<string, unknown>` that mutates a plain object into wire shape and returns it.
- **`SerializeOptions`** (interface) — Per-model customization passed to `applySerialization`:
  - `dropId` — delete `_id` entirely instead of renaming (used only by `audit-logs`).
  - `omit` — top-level keys to strip after the shared steps (secrets, contract-omitted fields).
  - `after` — optional callback for model-specific post-processing (nested normalization, derived fields, format tweaks).
  - `virtuals` — whether `toJSON` includes Mongoose virtuals (default `true`).
- **`SerializableSchema`** (internal interface) — Structural type exposing only `set('toJSON', …)` so the file avoids Mongoose's generic document-type constraint on the parameter.
- **`applySerialization`** (exported function) — Builds the shared transform, wires it into the schema's `toJSON` options (`versionKey: false`, virtuals, transform), and **returns** the transform so the model can also export it for the lean/aggregate path.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Imports the transform that each model exports (the return value of `applySerialization`) and applies it to raw BSON documents returned by `.lean()` / `.aggregate()` queries.
- **All `src/modules/*/model.ts` files** (addresses, api-keys, audit-logs, cart, delivery, feedback, inventory, locales, orders, payments, products, users, webhooks, wishlist) — Each calls `applySerialization` once at schema-definition time to wire `toJSON` and to obtain the transform for its repository.

## Notes

- Deliberately **not** a Mongoose `schema.plugin()`: a plugin's return value is discarded, but the transform must be returned so the model can export it for the lean/aggregate path. Calling `applySerialization` directly keeps both the `toJSON` wiring and the exported serializer on one line per model.
- `audit-logs` is the only collection that passes `dropId: true`, because exposing a stable id there would invite an addressable endpoint that should not exist.
- The single `as Record<string, unknown>` cast in the `toJSON` transform wiring is intentional one-step widening (Mongoose hands a narrower `{ _id, __v? }` shape); the code comment explicitly rejects `as unknown as`.
