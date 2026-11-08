---
source: src/infrastructure/object-guards.ts
sha256: 21f33adc6e5b1d8b7a6b95d64bd54ec5f295d867ff524be59e4b18239802842a
generated_at: 2026-11-08T03:37:46.983747+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/object-guards.ts

## Purpose

Provides three small, generic object/value helpers (`isPlainObject`, `stripUndefined`, `fillOmittedWithNull`) that sit at the JSON/request boundary. The module exists so that unrelated call sites—i18n dictionary merging, locale key trees, HTTP request bodies, and test factories—don't each hand-roll the same one-liner.

## Key elements

- **`isPlainObject(value: unknown): value is Record<string, unknown>`** — Type guard that accepts only plain objects. Explicitly rejects `null` and arrays, which a bare `typeof === 'object'` check would miss.
- **`stripUndefined<T extends Record<string, unknown>>(source: T): T`** — Returns a copy of `source` with every key whose value is `undefined` removed. Named to avoid confusion with lodash's array-oriented `compact`.
- **`fillOmittedWithNull<TValue>(body, fields): Record<string, TValue | null>`** — Spreads `body` and sets any name in `fields` that is absent to `null`. Implements the PUT "full-replace" semantic (RFC 9110 §9.3.4) where the write layer treats an explicit `null` as "clear this field."

## Relationships

- **`src/infrastructure/http/request.ts`** — Its `readInput` helper relies on `stripUndefined` to prevent explicit `undefined` values in a `||`-merged request body from leaking into a Mongoose filter.
- **`src/infrastructure/i18n/catalog.ts`** — Uses `isPlainObject` when merging i18n dictionaries (distinguishing nested nodes from leaf values).
- **`src/modules/locales/services/keys.ts`** — Uses `isPlainObject` while traversing locale key trees.
- **`src/infrastructure/surfaces/create-update-controller.ts`** — Calls `fillOmittedWithNull` on PUT bodies so the write layer receives an explicit `null` for every clearable field the client omitted.
- **`src/modules/products/services/translated-write.ts`** — Calls `fillOmittedWithNull` on PUT translation entries for the same full-replace reason.
- **Module factories** (`src/modules/{addresses,locales,orders,products,users}/factories.ts`) — Call `stripUndefined` so a `{ field: undefined }` spread does not shadow a model's Mongoose `default:`.

## Notes

- `stripUndefined` returns a **copy**, not a mutation. Callers should not assume identity with the input.
- `fillOmittedWithNull` only fills fields listed in the `fields` array; any field the resource *cannot* clear must not be passed in, or it will gain a spurious `null`.
- The generic `<TValue>` on `fillOmittedWithNull` is deliberately unconstrained so it works for heterogeneous records (strings, numbers, nested objects) in one call.
