---
source: tests/unit/infrastructure/i18n/context.test.ts
sha256: edde0bdb656450c08a8d1a185721b0e12b94a5236bdbc1976c3d4a3c550a2f83
generated_at: 2026-09-23T20:24:17.969496+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/i18n/context.test.ts

## Purpose

Unit tests for the request-scoped i18n context built on `AsyncLocalStorage`. Verifies that the ambient `t` resolves against the correct locale inside a scope, falls back to the global instance outside one, survives async boundaries, and keeps concurrent scopes isolated from each other.

## Key elements

- **`describe('the ambient t')`** — the sole test suite; contains five cases covering the invariants listed above.
- **Scope resolution test** — asserts `t`, `getCurrentLocale`, and `getLocaleContext` all reflect the scope's locale (`'it'`) inside `runWithLocale`.
- **Global-fallback test** — asserts `getLocaleContext()` is `undefined` and `t` resolves via the global (English) instance when no scope is active.
- **Async-survival test** — proves the context persists across `Promise.resolve` and a `setImmediate` hop inside the scope.
- **Concurrent-scope isolation test** — runs two `runWithLocale` thunks (`'it'` and `'en'`) concurrently with staggered `setImmediate` hops so their microtask queues interleave; asserts each sees only its own locale.
- **Non-mutation test** — confirms `createLocaleContext` does not change the result of `getCurrentLocale()`.

## Relationships

- **`src/infrastructure/i18n/context.ts`** — the module under test; provides `createLocaleContext`, `getCurrentLocale`, `getLocaleContext`, `runWithLocale`, and `t` (imported via the barrel below).
- **`src/infrastructure/i18n/index.ts`** — the barrel (`@infrastructure/i18n`) through which all exports are imported in this test; also the re-export surface consumers use in production.

## Notes

- All async interleaving is forced with `setImmediate`, not `setTimeout`, to create a real task-boundary hop without depending on a wall-clock duration. This mirrors the exact boundary the `AsyncLocalStorage` store must survive.
- The concurrent-scope test is the one that would fail on a regression where one request picks up another's language; it only triggers under deliberate interleaving, which is why the module lives in its own file rather than being tested inline with the i18n helpers.
- Assertions compare against the raw JSON locale files (`enUsers`, `itUsers`) rather than hard-coded strings, so the tests track the source-of-truth translations.
