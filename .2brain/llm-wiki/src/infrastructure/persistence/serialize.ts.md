---
source: src/infrastructure/persistence/serialize.ts
sha256: d67983dc808dabd8b1d2d904cadfcf908832dde878a257e786eb3d12df178cba
generated_at: 2026-09-27T14:14:41.796678+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/serialize.ts

## Purpose

Centralises the "stored BSON document → API wire payload" transformation in one function. Handles the three mechanical steps (`_id` → `id`, drop `__v`, strip caller-named keys) plus an optional model-specific hook, and wires the same transform into Mongoose's `toJSON` so that both the hydrated-document path and the raw `.lean()`/`.aggregate()` path produce identical output.

## Key elements

- **`applySerialization(schema, options?)`** — The sole export. Builds the transform, sets it on `schema.set('toJSON', …)`, and **returns** the transform so the model can reuse it on the lean/aggregate path. One call per model, one line.
- **`SerializeOptions`** — Per-model customisation passed to `applySerialization`:
  - `dropId` — delete `_id` entirely instead of renaming (used only by `audit-logs`).
  - `omit` — top-level keys to strip after the shared steps (secrets, fields absent from the contract).
  - `after` — free-form hook for nested normalisation, derived fields, or format tweaks.
  - `virtuals` — whether `toJSON` includes Mongoose virtuals (default `true`).
- **`SerializeTransform`** — The function type `(serialized: Record<string, unknown>) => Record<string, unknown>` shared by both serialization paths.
- **`SerializableSchema`** (private) — Minimal structural type so the file depends only on the `set('toJSON', …)` signature, avoiding a concrete `Schema<T>` generic that would pin it to one document type.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Imports the returned `SerializeTransform` and invokes it inside its `normalize` helper so that `.lean()` and `.aggregate()` results receive the same treatment as `toJSON` documents.
- **All module model files** (`addresses`, `api-keys`, `audit-logs`, `cart`, `delivery`, `feedback`, `inventory`, `locales`, `orders`, `payments`, `products`, `users`, `webhooks`, `wishlist`) — Each calls `applySerialization` once during schema definition, passing model-specific `SerializeOptions`, and exports the returned transform for the repository's lean path.

## Notes

- **Not a Mongoose plugin by design.** A plugin's return value is discarded; `applySerialization` must return the transform so the model can export it. Calling it directly keeps both the `toJSON` wiring and the exported serializer on a single line.
- **`virtuals` defaults to `true`.** A model must explicitly opt out (`virtuals: false`) if it has no Mongoose virtuals it wants on the wire.
- **`dropId` exists solely for `audit-logs`.** Every other collection exposes a public `id`; dropping it elsewhere would break the contract.
- The `as { toString(): string }` cast on `_id` is an eslint suppression to satisfy `no-base-to-string` — it does not change runtime behaviour.
