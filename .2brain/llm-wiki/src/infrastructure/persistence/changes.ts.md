---
source: src/infrastructure/persistence/changes.ts
sha256: 74eca1d454031271f18480760cdfb3b67051dcb775ea2a87bd239d1a1ed22696
generated_at: 2026-11-08T03:41:42.230106+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/changes.ts

## Purpose

Provides small utilities for translating a domain change-set (field path → new value) into the two-operator shape Mongo expects (`$set` / `$unset`). It exists so every repository that performs a partial update shares one consistent mapping from `null` (clear) and real values (set) to Mongoose/Mongo write operators, keeping the "PUT replaces, PATCH merges" contract (see `docs/theory/request-flow.md`) uniform across modules.

## Key elements

- **`clearedOrValue<T>(value: T | null): T | undefined`** — Coerces `null` to `undefined`. Used on hydrated Mongoose documents so that `.save()` emits `$unset` for cleared optional fields rather than persisting a literal `null`.
- **`SetAndUnset`** (interface) — A partial `{ $set?: Record<string, unknown>; $unset?: Record<string, 1> }` shape representing the two operator halves of one Mongo update. An absent key means "no fields in that half."
- **`setAndUnset(changes)`** — Accepts a flat `Record<string, unknown>` change-set where `undefined` signals "clear this field." Returns a `SetAndUnset` object with non-empty `$set` and/or `$unset` only (Mongo rejects empty operators).

## Relationships

- **Repository files** (`src/modules/addresses/repository.ts`, `src/modules/locales/repository.ts`, `src/modules/orders/repository.ts`, `src/modules/payments/repository.ts`, `src/modules/webhooks/repository.ts`) — Import `setAndUnset` (and/or `clearedOrValue`) to build the Mongo update document from a change-set before calling `collection.updateOne` or equivalent.
- **Service files** (`src/modules/products/services/crud.ts`, `src/modules/users/services/update.ts`, `src/modules/webhooks/services/subscriptions.ts`) — Produce the change-set that is ultimately passed into `setAndUnset`, or apply `clearedOrValue` field-by-field on a hydrated document before `.save()`.
- **`tests/unit/infrastructure/persistence/changes.test.ts`** — Unit-tests `clearedOrValue` and `setAndUnset` for the `null`→`undefined` coercion and the split/omit-empty behavior.

## Notes

- `null` in a change-set is the domain-level "clear this field" sentinel; it is *never* written to Mongo as a stored value. The file deliberately maps it to `undefined` so Mongoose emits `$unset`.
- `setAndUnset` omits a `$set` or `$unset` key entirely when its half is empty — do not expect an empty `{ $set: {} }` in the returned object.
- The function treats **only** `undefined` as the "unset" signal; a genuine `undefined` passed by a caller (as opposed to a coerced `null`) has the same effect. Callers must rely on `clearedOrValue` to perform the `null → undefined` step before invoking `setAndUnset`.
