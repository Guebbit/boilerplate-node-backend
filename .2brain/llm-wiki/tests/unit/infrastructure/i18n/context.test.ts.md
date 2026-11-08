---
source: tests/unit/infrastructure/i18n/context.test.ts
sha256: d14f9d8f0f9fab0c26355b4e85c942d7f5efd50b55d87cb3140b646b0a070b2c
generated_at: 2026-11-08T10:19:31.392244+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/i18n/context.test.ts

## Purpose
Unit tests for the request-scoped i18n context (`t`, `runWithLocale`, and the underlying `AsyncLocalStorage`). It verifies that the ambient translator resolves correctly inside a scope, falls back to the global instance outside one, survives async task hops, and stays isolated when two scopes interleave concurrently. The interleaving tests exist specifically because the cross-request language-leak bug only manifests under concurrency.

## Key elements
- **`describe('the ambient t', …)`** — single suite covering five behaviors:
  - *resolves against the scope's locale inside a scope* — asserts `t`, `getCurrentLocale`, and `getLocaleContext` all reflect the active `'it'` scope.
  - *falls back to the global instance outside any scope* — confirms `getLocaleContext()` is `undefined` and `t` still returns the English (default) translation.
  - *survives awaits* — crosses two async boundaries (`Promise.resolve` + `setImmediate`) inside `runWithLocale` to prove the store is not lost across task hops.
  - *keeps two overlapping scopes apart* — runs `runWithLocale('it', …)` and `runWithLocale('en', …)` via `Promise.all` with deliberately asymmetric `setImmediate` counts so their continuations interleave; asserts each returns its own locale's string.
  - *binds a context without mutating the global language* — calls `createLocaleContext('it')` and asserts `getCurrentLocale()` is unchanged.

- **Locale fixtures** — `enUsers` and `itUsers` imported from `@modules/users/locales/*.json`; used as expected-value sources rather than hard-coded strings.

## Relationships
- **`src/infrastructure/i18n/context.ts`** — the implementation under test. This file exercises `runWithLocale`, `t`, `getCurrentLocale`, `getLocaleContext`, and `createLocaleContext` as exported from the barrel.
- **`src/infrastructure/i18n/index.ts`** — the barrel import (`@infrastructure/i18n`) through which all five symbols are consumed; a rename or removal in the barrel breaks this file's imports directly.

## Notes
- The async tests use `setImmediate` (not `setTimeout`) to cross a real macrotask boundary without a wall-clock dependency; the comment in the file explicitly calls this out so a future refactor doesn't "simplify" it to `setTimeout(0)`.
- The interleaving test uses *asymmetric* task-hop counts (2 vs 1) so the two scopes' continuations actually cross; identical hop counts would serialize them and hide the bug.
- `createLocaleContext` is expected to be a pure read/bind — it must *not* change what `getCurrentLocale()` returns. A regression that couples creation to a global mutation would be caught only by the last test.
