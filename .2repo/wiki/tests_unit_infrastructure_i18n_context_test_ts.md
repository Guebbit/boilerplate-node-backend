# tests/unit/infrastructure/i18n/context.test.ts

## Purpose

Unit tests for the request-scoped i18n context — the `AsyncLocalStorage`-based mechanism that lets `t()` resolve against the locale set by the current request, while silently falling back to the global instance outside any scope. The file exists because the failure modes it guards (out-of-scope raw keys, concurrent-request cross-talk) are invisible to integration tests and only surface under deliberate concurrency or out-of-band code paths.

## Key elements

- **`describe('the ambient t')`** — the single suite; all assertions target the five public exports imported from `@infrastructure/i18n`.
- **In-scope resolution** — verifies `t`, `getCurrentLocale`, and `getLocaleContext` all reflect the locale passed to `runWithLocale`.
- **Out-of-scope fallback** — asserts `getLocaleContext()` is `undefined` and `t` resolves against the global (English) instance, protecting jobs, workers, and migrations.
- **Async survival** — confirms the scope is preserved across `await Promise.resolve()` and a `setImmediate` task hop, so deep promise chains still see the correct locale.
- **Concurrent scope isolation** — runs two `runWithLocale` thunks in parallel with deliberately mismatched `setImmediate` counts to force genuine interleaving; asserts each thunk reads its own locale.
- **`createLocaleContext` non-mutation** — confirms calling it does not change `getCurrentLocale()` (i.e., it creates a context without reassigning global state).

## Relationships

- **`src/infrastructure/i18n/context.ts`** — the implementation under test; exports `createLocaleContext`, `getCurrentLocale`, `getLocaleContext`, `runWithLocale`, and `t`.
- **`src/infrastructure/i18n/index.ts`** — barrel file; the test imports all five symbols through `@infrastructure/i18n`, so a rename or re-export change here would break this test.
- **`@modules/users/locales/en.json` / `it.json`** — fixture data used to assert that `t` returns the correct localized string without depending on the global i18n instance's dictionary.

## Notes

- The concurrency test uses `setImmediate` (not `setTimeout`) to cross an async boundary deterministically; this is a deliberate choice to avoid wall-clock flakiness while still exercising the same micro/macro-task boundary the `AsyncLocalStorage` store must survive.
- The interleaving case is the reason the implementation lives in its own module: the "one request answered in another's language" bug cannot be caught by sequential tests.
- The out-of-scope test is intentionally minimal (no `runWithLocale` wrapper); its absence of a scope is the point.
- Locale fixture keys are namespaced (`users.field-email-invalid`) to avoid collision with any other module's keys that the global instance might carry.
