---
source: src/infrastructure/persistence/changes.ts
sha256: 74eca1d454031271f18480760cdfb3b67051dcb775ea2a87bd239d1a1ed22696
generated_at: 2026-10-14T08:08:01.407728+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/changes.ts

## Purpose

Utility module that converts a change-set (a flat record of field-path → value) into the `$set` / `$unset` operator halves required by a MongoDB update on a hydrated Mongoose document. It exists so that every repository and service that applies an update builds the operator object the same way, centralising the "null means clear" and "empty operator halves must be omitted" rules in one place.

## Key elements

- **`clearedOrValue<T>(value: T | null): T | undefined`** — Maps `null` (the change-set's "clear this field" sentinel) to `undefined`, which is what a cleared optional field must look like on a hydrated document so that `.save()` emits `$unset` instead of writing a literal `null`.
- **`SetAndUnset`** — Interface with optional `$set?: Record<string, unknown>` and `$unset?: Record<string, 1>`. A half is present only when it has at least one entry.
- **`setAndUnset(changes: Readonly<Record<string, unknown>>): SetAndUnset`** — Splits a change-set into the two Mongo operators. Entries whose value is not `undefined` go into `$set`; entries whose value is `undefined` go into `$unset` (mapped to `1`). Empty halves are omitted because MongoDB rejects an empty `$set` or `$unset`.

## Relationships

- **Repositories** (`addresses`, `locales`, `orders`, `payments`) and **services** (`products/crud`, `users/update`, `feedback`, `webhooks/subscriptions`) are the primary consumers; they call `setAndUnset` (and sometimes `clearedOrValue`) to build the update document they pass to a Mongoose `updateOne` / `replaceOne` or to assign onto a hydrated document before `.save()`.
- **`tests/unit/infrastructure/persistence/changes.test.ts`** — unit tests covering the `null` → `undefined` mapping and the split / empty-half-omission behaviour of `setAndUnset`.

## Notes

- The `null` → `undefined` mapping is deliberate: assigning `undefined` to a Mongoose path causes `.save()` to emit `$unset`; assigning `null` would store a literal `null` in the document. Callers must run change-set values through `clearedOrValue` (or equivalent) **before** feeding them to `setAndUnset`.
- `setAndUnset` treats any non-`undefined` value (including `null`, `0`, `""`, `false`) as a `$set` entry. If a caller genuinely wants to write a `null` to disk, they must bypass the `clearedOrValue` conversion.
- The module doc references `docs/theory/request-flow.md#put-replaces-patch-merges` for the higher-level PUT-replaces / PATCH-merges semantics that motivate the "clear" convention.
