---
source: tests/unit/kernel/translation.test.ts
sha256: cfd34494399ee4db4ae9ab2f966af0be53680e810a8833e8db0745914efa6354
generated_at: 2026-10-15T13:23:21.509074+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/translation.test.ts

## Purpose

Unit tests for the translation port façade exported by `@kernel/translation`. Verifies that every public function (`resolveTranslations`, `removeTranslations`, `searchTranslatedEntityIds`, `planTranslations`, `writeTranslations`, `readAllTranslations`, `applyTranslations`, `clearOmittedFields`) behaves as a safe no-op when no port is registered, and faithfully delegates to a registered port when one is. Also pins the 422 validation rules for the plan-payload shape and the ambient-locale resolution chain used by `applyTranslations`.

## Key elements

- **`fakePort(overrides?)`** — Builds a `TranslationPort` whose methods are `jest.fn()` mocks with sensible resolved defaults (empty `Map`, `0`, `[]`, etc.); accepts a partial override so individual tests can stub one method.
- **`afterEach`** — Calls `registerTranslationPort(undefined)` so each test starts with no port registered.
- **`describe('resolveTranslations')`** — Empty-batch short-circuit (port not called), pass-through delegation, re-registration replacing the prior port.
- **`describe('removeTranslations')`** — Zero-removal default, delegation with return count, transaction `ClientSession` forwarding.
- **`describe('searchTranslatedEntityIds')`** — Empty-array default, delegation with exact arguments.
- **`describe('planTranslations')`** — Single fallback-locale upsert when unregistered; 422 for non-fallback locale, `null` fallback slot, and empty fallback slot; `isTranslationAvailable` toggle; delegation.
- **`describe('writeTranslations')`** — No-op when unregistered; delegation including translator id; transaction session forwarding.
- **`describe('readAllTranslations')`** — Empty-map default; identity return of the port's map.
- **`describe('applyTranslations')`** — Empty batch, no-port pass-through, overlay by entity id, reference preservation for unmatched items, and locale-chain construction (`['it-CH','it','en']`) from ambient + base + fallback via `runWithLocale`.
- **`describe('clearOmittedFields')`** — Null-fills declared-but-absent fields; preserves undeclared keys the caller stated.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/translation.ts` | Module under test — every exported function and the `TranslationPort` type are imported and exercised here. |
| `src/infrastructure/i18n/index.ts` | Provides `runWithLocale`, used in the `applyTranslations` tests to set the ambient locale before the call. |
| `src/infrastructure/i18n/context.ts` | Underlying implementation of the locale context that `runWithLocale` sets; not directly imported but is the mechanism behind the locale-chain assertions. |
| `tests/support/environment.ts` | `setEnvironment` sets `NODE_FALLBACK_LOCALE` (used in `planTranslations` and `applyTranslations` blocks). |
| `tests/support/stub.ts` | `asStub<ClientSession>({})` produces a typed stand-in for a Mongoose session, passed through `removeTranslations` and `writeTranslations`. |

## Notes

- The file header explicitly carves out `localeCandidatesFor` tests: those live in `tests/unit/infrastructure/i18n/catalog.test.ts` because that function is pure locale-chain maths with no port dependency.
- A core invariant, mirrored from `overrides.test.ts`: an unregistered port must be a **safe, ordinary state** — every facade function must resolve to an empty/default value without throwing, so a consumer that never imports `modules/locales` still works.
- `applyTranslations` is the only function tested with `runWithLocale`; all others are called directly. This reflects that `applyTranslations` is the read-path overlay that depends on the ambient locale, while the write/search paths receive their locale explicitly.
- `clearOmittedFields` is a pure synchronous helper (no port, no async) — it is the only entry in this file that tests a non-port function.
