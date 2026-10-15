---
source: tests/unit/infrastructure/i18n/context.test.ts
sha256: d14f9d8f0f9fab0c26355b4e85c942d7f5efd50b55d87cb3140b646b0a070b2c
generated_at: 2026-10-15T13:16:36.754465+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/i18n/context.test.ts

## Purpose

Unit tests for the request-scoped translation context (AsyncLocalStorage-based `t`). Verifies that a locale scope correctly resolves translations, that code outside any scope falls back to the global instance, that the scope survives across `await` boundaries, and that two concurrent scopes never bleed into each other — the last being the concurrency bug the module exists to prevent.

## Key elements

- **`describe('the ambient t')`** — single suite covering five scenarios:
  - *Scope resolution*: inside `runWithLocale('it', …)`, `t`, `getCurrentLocale`, and `getLocaleContext` all reflect `'it'`.
  - *Global fallback*: outside any scope, `getLocaleContext()` is `undefined` and `t` resolves via the global (English) instance.
  - *Async survival*: `t` still sees the scope after `Promise.resolve` and a `setImmediate` hop.
  - *Interleaved scopes*: two concurrent `runWithLocale` calls (asymmetric task-hop counts) each resolve in their own language.
  - *No global mutation*: `createLocaleContext('it')` does not change `getCurrentLocale()`.
- **Fixture data** — `enUsers` / `itUsers` imported from `@modules/users/locales/*.json` provide the expected translated strings.
- **Public API under test** — `createLocaleContext`, `getCurrentLocale`, `getLocaleContext`, `runWithLocale`, `t` (all imported from `@infrastructure/i18n`).

## Relationships

- **`src/infrastructure/i18n/context.ts`** — the implementation under test; provides the AsyncLocalStorage store and the functions this file exercises.
- **`src/infrastructure/i18n/index.ts`** — barrel re-export; the test imports the public surface through it, so a rename or removal in the barrel breaks this file even if `context.ts` itself is unchanged.

## Notes

- Concurrency tests use `setImmediate` (not `setTimeout`) to force a real task hop without timing sensitivity; the interleaving case deliberately gives the two scopes different hop counts (`2` vs `1`) so their microtask/macrotask windows actually overlap.
- The "no global mutation" test guards a subtle invariant: creating a context object is a pure allocation; only *entering* it (`runWithLocale`) changes the ambient locale.
- The fallback test is load-bearing for out-of-band execution (jobs, scripts): a regression there manifests as raw i18n keys appearing in logs rather than a test failure until this test is run.
