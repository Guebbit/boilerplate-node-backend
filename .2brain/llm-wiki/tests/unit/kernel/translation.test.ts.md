---
source: tests/unit/kernel/translation.test.ts
sha256: 109f403cabba64a6eeb8b7f0f6cbbaea96cc99d23bc044f1b705a7033d798b03
generated_at: 2026-09-27T16:12:40.908885+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/translation.test.ts

## Purpose
Unit tests for the public API of the translation port (`@kernel/translation`). Every function is exercised in two modes: **no port registered** (must return a safe default without throwing) and **fake port registered** (must delegate with exact arguments). The file exists to lock down the port's contract independently of any concrete infrastructure, and to guarantee that a test suite that never loads `modules/locales` still resolves product titles gracefully.

## Key elements
- **`fakePort(overrides?)`** – Factory returning a `TranslationPort` whose methods are `jest.fn()` mocks with sensible empty defaults (`new Map()`, `0`, `[]`, `{ fallbackLocale: 'en', planned: [] }`). Tests spread `overrides` to replace individual methods.
- **`afterEach` cleanup** – Resets the registered port to `undefined` and restores the `NODE_FALLBACK_LOCALE` env var captured before the suite ran.
- **`describe('resolveTranslations')`** – Empty-map default, empty-batch short-circuit (port never called), exact-argument delegation, second-registration-replaces-first.
- **`describe('removeTranslations')`** – Zero-removed default; delegation returns the port's count.
- **`describe('searchTranslatedEntityIds')`** – Empty-list default; exact-argument delegation.
- **`describe('planTranslations')`** – Fallback-locale upsert plan; 422 error for non-fallback locale, `null` fallback slot, and empty fallback slot; `isTranslationAvailable()` gate; exact-argument delegation. Sets `NODE_FALLBACK_LOCALE` in `beforeEach`.
- **`describe('writeTranslations')`** – No-op default; exact-argument delegation (including the `translator` id).
- **`describe('readAllTranslations')`** – Empty-map default; delegation returns the port's `Map` by reference.
- **`describe('applyTranslations')`** – Empty-batch passthrough; no-registration passthrough (items returned as-is); field overlay matched by `id`; unmatched items preserved **by reference** (`toBe`); locale-chain resolution (`it-CH → it → en`) verified via `runWithLocale`.

## Relationships
- **`src/kernel/translation.ts`** – The system under test. All functions (`applyTranslations`, `resolveTranslations`, `planTranslations`, `writeTranslations`, `readAllTranslations`, `removeTranslations`, `searchTranslatedEntityIds`, `isTranslationAvailable`, `isTranslationPlan`) and the `TranslationPort` type are imported from here.
- **`src/infrastructure/i18n/index.ts`** – Barrel re-export; the test imports `runWithLocale` through `@infrastructure/i18n`.
- **`src/infrastructure/i18n/context.ts`** – Implements `runWithLocale`, which sets the ambient locale for `applyTranslations` tests so the locale-candidate chain (locale → base → fallback) can be asserted.

## Notes
- **`localeCandidatesFor` is intentionally absent.** Its tests live in `tests/unit/infrastructure/i18n/catalog.test.ts` because it is pure locale-chain arithmetic with no port or registration state.
- **`NODE_FALLBACK_LOCALE` is process-global.** Each `describe` block that depends on it sets it in `beforeEach`; the top-level `afterEach` restores the original value (or deletes the key if it was unset). Tests that mutate it inline (e.g., the locale-chain test in `applyTranslations`) rely on the cleanup to prevent cross-test leakage.
- **Identity assertions matter.** `applyTranslations` uses `toBe` (reference equality) to prove that items with no matching translation row are returned unchanged, not cloned.
- **The "no port" path is the primary contract.** Each function's first test asserts the safe default, mirroring the philosophy noted in `overrides.test.ts`: an unregistered port is a normal, non-throwing state.
