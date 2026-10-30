---
source: src/infrastructure/object-guards.ts
sha256: 21f33adc6e5b1d8b7a6b95d64bd54ec5f295d867ff524be59e4b18239802842a
generated_at: 2026-10-29T02:07:52.068839+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/object-guards.ts

## Purpose

A small set of shared value-guard and object-shaping utilities that prevent unrelated call sites (i18n dictionary merging, locale key trees, HTTP request bodies, test factories) from each re-implementing the same one-line logic. It exists so the three helpers have a single canonical location without belonging to any one module.

## Key elements

- **`isPlainObject(value: unknown): value is Record<string, unknown>`** — Type guard for a plain object. Unlike a bare `typeof === 'object'` check, it excludes `null` and arrays, which callers treat as leaves rather than nodes to descend into.
- **`stripUndefined<T extends Record<string, unknown>>(source: T): T`** — Returns a copy of `source` with every key whose value is `undefined` removed. Prevents explicit `undefined`s from leaking into Mongoose filters (request path) or from shadowing model `default:` values when a factory spread is applied.
- **`fillOmittedWithNull<TValue>(body, fields): Record<string, TValue | null>`** — Adds `null` for every entry in `fields` that is absent from `body`. Encodes the PUT semantics ("the body IS the new resource", RFC 9110 §9.3.4) so the write side can distinguish "clear" (`null`) from "leave as-is" (absent).

## Relationships

- **`src/infrastructure/http/request.ts`** — `readInput` in that module relies on `stripUndefined` so that a `||`-merged request body does not carry explicit `undefined` values into a downstream Mongoose filter.
- **`src/infrastructure/i18n/catalog.ts`** — Uses `isPlainObject` (and possibly `stripUndefined`) when merging or traversing i18n dictionary structures.
- **`src/modules/locales/services/keys.ts`** — Walks locale key trees; `isPlainObject` distinguishes branch nodes from leaf values.
- **`src/infrastructure/surfaces/create-update-controller.ts`** — Calls `fillOmittedWithNull` to normalise a PUT body before handing it to the write layer.
- **`src/modules/products/services/translated-write.ts`** — Uses `fillOmittedWithNull` on a PUT translation entry for the same "clear vs. absent" reason.
- **Test factories** (`src/modules/addresses/factories.ts`, `src/modules/locales/factories.ts`, `src/modules/orders/factories.ts`, `src/modules/products/factories.ts`, `src/modules/users/factories.ts`) — Call `stripUndefined` before spreading partial objects over model defaults so that `{ stock: undefined }` does not override a `default:` value.

## Notes

- `stripUndefined` is deliberately **not** named `compact` to avoid confusion with lodash's array-oriented, falsy-dropping `compact`. The two behave very differently.
- `fillOmittedWithNull` uses `in` (not a truthiness check) to decide whether a field was omitted, so an explicit `null` already present in the body is preserved rather than overwritten.
- `stripUndefined` is generic over `T` but the implementation path goes through `Object.fromEntries` / `Object.entries`, which widens to `{ [k: string]: unknown }`; the trailing `as T` cast is what restores the caller's key type. This is safe because the filter only *removes* keys, never adds them.
