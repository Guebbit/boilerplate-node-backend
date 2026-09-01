# src/modules/users/tests/unit/validation-messages.test.ts

## Purpose

Unit tests that verify `zodUserSchema`'s validation messages resolve against the **active** i18next locale at parse time, not against whatever locale happened to be set (or unset) when the module was first imported. The tests assert the exact shipped strings per locale so that a silent fallback to Zod's built-in English defaults — the failure mode produced by calling `t()` before `i18next.init()` — is caught immediately rather than masked by a generic "key looks valid" check.

## Key elements

- **`copy(locale)`** — extracts the `users`-namespace string map for `'en'` or `'it'` from `mergedResources()`, used as the source of truth for expected messages.
- **`invalidUser`** — a fixed payload (`{ email, username, password }`) guaranteed to violate every rule under test.
- **`messagesFor(locale)`** — async helper that calls `loadBeforeI18n(locale, …)` to import the users module *before* i18n init, then runs `zodUserSchema.safeParse(invalidUser)` and returns the array of issue messages.
- **`describe('user validation messages')`** — four cases:
  1. English messages match the shipped English strings verbatim.
  2. Italian messages match the shipped Italian strings when locale is `it`.
  3. Meta-check: the Italian strings are *not* identical to the English ones (guards against a missing translation file).
  4. Locale-change test: parses the same schema object under `en`, switches to `it` via `i18next.changeLanguage`, parses again, and confirms the messages differ. Uses `jest.isolateModulesAsync` to control the import cache.

## Relationships

- **`src/modules/users/index.ts`** — the module under test. The tests import it (via `loadBeforeI18n` or direct `import`) to obtain `zodUserSchema`, then call `.safeParse` to trigger message resolution.
- **`tests/support/i18n-boot.ts`** — supplies `loadBeforeI18n` (loads a module, initializes i18next to a chosen locale, and gates on a sentinel translation key) and `mergedResources()` (the consolidated i18n resource bundle). Both are imported at the top of the file.

## Notes

- The module doc comment calls out the specific regression this file guards against: `t()` invoked at module scope before `i18next.init()` returns `undefined`, causing Zod to silently use its own English defaults. The "exact string" assertions are deliberately stricter than a `not.toBe(aDottedKey)` check.
- The locale-change test (case 4) deliberately avoids `loadBeforeI18n` and instead uses `jest.isolateModulesAsync` + manual `i18next.init` / `changeLanguage` to prove the schema's message function is a thunk that re-reads the active locale, not a value frozen at import time.
- Both `en` and `it` are the only locales exercised; adding a new locale requires extending the `copy` helper's union type and the test cases.
