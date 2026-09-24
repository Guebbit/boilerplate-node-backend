---
source: tests/unit/kernel/translation.test.ts
sha256: 9192ed9189f6e2a3f921d7c9b1c31db554b3e294d30b1672f4616652ec73d91c
generated_at: 2026-09-23T20:28:37.372774+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/translation.test.ts

## Purpose

Unit-test suite for every public function of the translation port in `@kernel/translation`. It verifies two invariants for each function: (1) an **unregistered** port yields a safe, no-throw default (empty map/list, zero count, or a failure result), and (2) a **registered** port receives its arguments verbatim and its return value is passed through unchanged. A separate block covers `applyTranslations`, which overlays resolved fields onto already-wire-shaped page items.

## Key elements

- **`fakePort(overrides?)`** — builds a `TranslationPort` double whose six methods are `jest.fn()` by default; callers spread in per-test overrides.
- **`afterEach` cleanup** — calls `registerTranslationPort(undefined)` and restores (or deletes) `process.env.NODE_FALLBACK_LOCALE` so tests never leak state.
- **`describe('resolveTranslations')`** — four cases: empty-map default, empty-batch short-circuit (port not called), argument passthrough, and second-registration-replaces-first.
- **`describe('removeTranslations')`** — zero-count default and delegation.
- **`describe('searchTranslatedEntityIds')`** — empty-list default and delegation with exact argument match.
- **`describe('planTranslations')`** — unregistered returns a `success: false` result (not a throw); registered delegates.
- **`describe('writeTranslations')`** — unregistered resolves `undefined` without side-effects; registered delegates including the `translatorId` param.
- **`describe('readAllTranslations')`** — empty-map default and delegation returning the port's `Map`.
- **`describe('applyTranslations')`** — empty-batch passthrough; unregistered passthrough (same reference); field overlay by `id`; unmatched items kept **by reference**; locale-chain resolution via `runWithLocale` asserting `['it-CH','it','en']`.

## Relationships

- **`src/kernel/translation.ts`** — the module under test. All seven port functions and the `TranslationPort` type are imported from here; the suite exercises their public contracts without touching any concrete adapter.
- **`src/infrastructure/i18n/context.ts`** — provides `runWithLocale`, which the `applyTranslations` tests wrap around calls to set the ambient locale and verify the candidate chain passed to `port.resolve`.
- **`src/infrastructure/i18n/index.ts`** — the barrel through which `@infrastructure/i18n` resolves `runWithLocale`; no other exports from this package are used.

## Notes

- `localeCandidatesFor` is **deliberately excluded** from this file; its tests live in `tests/unit/infrastructure/i18n/catalog.test.ts` because that function is pure locale-chain arithmetic with no port or registration dependency.
- The unregistered-port behavior is the critical invariant: a consumer that never imports a concrete locale adapter must still be able to call these functions without throwing. `planTranslations` is the one exception that returns an explicit failure result rather than a neutral empty value.
- `applyTranslations` identity-preservation (`toBe`, not `toStrictEqual`) is asserted for unmatched items — downstream code may rely on reference equality for unchanged pages.
- The locale-chain test sets `NODE_FALLBACK_LOCALE` directly (not via `runWithLocale`) to prove the env var feeds the third candidate slot.
