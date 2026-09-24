---
source: tests/support/i18n-boot.ts
sha256: dfbe0c7a4c71042db122e35120613c41261b08875240d5efc2c6059abf7d352b
generated_at: 2026-09-23T20:12:01.387896+00:00
model: ollama:qwen3.8:27b
---

# tests/support/i18n-boot.ts

## Purpose

Test-support helper that reproduces the production import ordering in `app.ts` (module evaluated first, `i18next.init()` second). Without it, Jest's `setupFiles` (via `tests/support/setup.ts`) initialises i18next before any spec module loads, so a `t()` call made at module scope silently returns a string under test but `undefined` in production. This file lets a spec deliberately load a target module against a **fresh, un-initialised** i18next, then initialise afterwards.

## Key elements

- **`mergedResources()`** – Returns the i18next `resources` object for `en` and `it` by calling `readLocaleDictionary` from the i18n infrastructure. Used to seed `i18next.init`.
- **`loadBeforeI18n<T>(locale, load, probeKey)`** – Inside `jest.isolateModulesAsync`:
  1. Imports the `i18next` module.
  2. Calls the caller-supplied `load()` (the module under test) *before* `i18next.init`.
  3. Asserts `i18next.isInitialized` is falsy and `t(probeKey)` is `undefined`, proving the ordering is real.
  4. Initialises i18next with the requested locale and `mergedResources()`.
  5. Returns the value produced by `load()`.

## Relationships

- **`src/infrastructure/i18n/index.ts`** – Barrel module; this file imports `readLocaleDictionary` through it (`@infrastructure/i18n`).
- **`src/infrastructure/i18n/catalog.ts`** – Source of `readLocaleDictionary`, which builds the per-locale translation object consumed by `mergedResources()`.
- **`src/modules/products/tests/unit/validation-messages.test.ts`** – Consumer; calls `loadBeforeI18n` to load product validation logic and assert its human-readable messages.
- **`src/modules/users/tests/unit/validation-messages.test.ts`** – Consumer; same pattern for the users module.

## Notes

- The `probeKey` argument is not optional flavour—it is a **guard assertion** that fails the test if i18next happens to already be initialised (e.g. a stray import order in the test itself). Pick a key that genuinely does not exist until init.
- This file is domain-agnostic by design; the module under test is always passed in via the `load` callback, which is why it lives in `tests/support` rather than under any feature folder.
- `jest.isolateModulesAsync` is required because the module under test may hold references (e.g. Zod schemas) created at import time; a plain re-import in the same module registry would reuse the cached evaluation.
