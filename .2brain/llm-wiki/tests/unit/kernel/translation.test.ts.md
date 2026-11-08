---
source: tests/unit/kernel/translation.test.ts
sha256: 05e93dc79f3a0297dc51084637aedd582f4cd74f66b621ff92361949183b8bf4
generated_at: 2026-11-08T10:28:42.536473+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/translation.test.ts

## Purpose

Unit tests for the translation kernel port (`TranslationPort`) and its public facade functions. Verifies three core contracts: (1) every facade is a safe no-op (empty Map / empty list / 0) when no port is registered, (2) each facade delegates to the registered port with exactly the arguments the caller supplied (including an optional `ClientSession`), and (3) `applyTranslations` overlays resolved fields onto already-wire-shaped items by id. Mirrors the "unregistered is a safe, ordinary state" convention established by `overrides.test.ts`.

## Key elements

- **`fakePort(overrides?)`** — Local helper that returns a `TranslationPort` whose methods are `jest.fn()`s with sensible defaults (empty `Map`, `0`, `[]`, empty plan). Accepts a partial override so individual tests can stub only what they care about.
- **`afterEach`** — Calls `registerTranslationPort(undefined)` to guarantee port isolation between tests.
- **`describe('resolveTranslations')`** — Covers: no-port → empty Map; empty batch → short-circuit (port not called); delegation with exact args; second registration replaces first.
- **`describe('removeTranslations')`** — Covers: no-port → `0`; delegation; `ClientSession` pass-through.
- **`describe('searchTranslatedEntityIds')`** — Covers: no-port → `[]`; delegation with exact args.
- **`describe('planTranslations')`** — Covers: no-port fallback upsert plan; 422 validation for non-fallback locale, null fallback, and empty fallback slot; `isTranslationAvailable()` toggle; delegation.
- **`describe('writeTranslations')`** — Covers: no-port → no-op; delegation; session pass-through.
- **`describe('readAllTranslations')`** — Covers: no-port → empty Map; delegation.
- **`describe('readServedTranslations')`** — Covers: no-port → empty Map; delegates to `port.readServed`, explicitly *not* `port.readAll`.
- **`describe('applyTranslations')`** — Covers: empty batch passthrough; no-port → items unchanged; overlay by id; unmatched items returned by reference; locale resolution via `runWithLocale` with base + fallback chain.

## Relationships

- **`src/kernel/translation.ts`** — Module under test. The file imports every facade function (`resolveTranslations`, `removeTranslations`, `searchTranslatedEntityIds`, `planTranslations`, `writeTranslations`, `readAllTranslations`, `readServedTranslations`, `applyTranslations`), the `TranslationPort` type, and the type guards `isTranslationAvailable` / `isTranslationPlan`.
- **`src/infrastructure/i18n/context.ts`** (via `@infrastructure/i18n` barrel) — Provides `runWithLocale` and `runWithLocaleContext`, used in `applyTranslations` tests to set the ambient locale for resolution.
- **`src/infrastructure/i18n/served.ts`** (via `@infrastructure/i18n` barrel) — Provides `setServedLanguages` / `resetServedLanguages` for served-language state in `applyTranslations` tests.
- **`src/infrastructure/i18n/index.ts`** — Barrel re-export; the test imports the i18n helpers through this path rather than reaching into submodules.
- **`tests/support/environment.ts`** — `setEnvironment` is used to pin `NODE_FALLBACK_LOCALE` (e.g. `'en'`) for `planTranslations` and `applyTranslations` tests.
- **`tests/support/stub.ts`** — `asStub<ClientSession>({})` creates a minimal `ClientSession` stand-in for transaction pass-through assertions.

## Notes

- The file header explicitly states that `localeCandidatesFor` cases live in `tests/unit/infrastructure/i18n/catalog.test.ts` because that function is pure locale-chain arithmetic with no port or registration dependency. Do not look for those tests here.
- `fakePort` spreads overrides *last*, so any method not overridden still gets its default `jest.fn()` — useful for asserting "was NOT called" on sibling methods.
- The `planTranslations` no-port path returns a structured 422 error object (`{ success: false, errors: [{ details: { field: … } }] }`) rather than throwing; tests assert on the shape, not on exception types.
- `applyTranslations` tests that need a specific locale use `runWithLocale('it', …)` rather than mutating global state, keeping the call synchronous-within-a-promise and avoiding cross-test leakage.
