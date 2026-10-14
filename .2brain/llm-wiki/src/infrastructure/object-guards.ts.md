---
source: src/infrastructure/object-guards.ts
sha256: 77f1bc6c862e5267535d1c4fad99e3614283aa2e99a63c826f4b76fbce464477
generated_at: 2026-10-14T08:03:45.602793+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/object-guards.ts

## Purpose

Provides two small, dependency-free value helpers — `isPlainObject` and `stripUndefined` — that multiple unrelated call sites (i18n merging, locale key trees, HTTP request parsing, test factories) would otherwise each re-implement. It exists to keep that logic in one place without pulling in a utility library.

## Key elements

- **`isPlainObject(value: unknown): value is Record<string, unknown>`** — Type guard that returns `true` only for plain objects. Explicitly excludes `null` and arrays (both of which pass a bare `typeof === 'object'` check but are treated as leaves, not traversable nodes, by every caller).
- **`stripUndefined<T extends Record<string, unknown>>(source: T): T`** — Returns a shallow copy of `source` with every key whose value is `undefined` removed. Used to prevent explicit `undefined` entries from leaking into Mongoose filters (via `readInput`) or from shadowing model `default:` values when spread over a factory base object.

## Relationships

- **`src/infrastructure/http/request.ts`** — `readInput` calls `stripUndefined` on `||`-merged request bodies so explicit `undefined`s don't reach a Mongoose query filter.
- **`src/infrastructure/i18n/catalog.ts`** — Uses `isPlainObject` while merging nested i18n dictionary entries to decide whether a value is a node to descend into or a leaf to replace.
- **`src/modules/locales/services/keys.ts` / `src/modules/locales/factories.ts`** — Use `isPlainObject` when walking locale key trees.
- **`src/modules/*/factories.ts` (addresses, orders, products, users)** — Call `stripUndefined` before spreading a partial override onto a default document, preventing `{ stock: undefined }` from winning over the schema's `default:`.
- **`tests/unit/infrastructure/object-guards.test.ts`** — Unit tests for both exports.

## Notes

- `stripUndefined` is deliberately **not** named `compact` to avoid implying lodash's array-only, all-falsy-dropping semantics.
- `stripUndefined` returns a **new object**; the original is not mutated.
- The internal `as T` cast in `stripUndefined` is required because `Object.fromEntries` types its result as `{ [k: string]: unknown }`, losing the concrete key names of `T`.
- `isPlainObject` narrows to `Record<string, unknown>`, not `object` — callers can index with arbitrary string keys immediately after the guard without a secondary assertion.
