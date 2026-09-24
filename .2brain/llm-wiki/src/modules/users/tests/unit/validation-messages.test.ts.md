---
source: src/modules/users/tests/unit/validation-messages.test.ts
sha256: 4bdc84e991b952b0748db2e26de4c4febfc49860760972a1b93b34d2eff79bf5
generated_at: 2026-09-23T19:37:21.158607+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/validation-messages.test.ts

## Purpose

Guards against a specific i18n ordering bug: if `t()` is called at module scope before `i18next.init()`, Zod falls back to its built-in English messages. This test asserts the **exact shipped strings** (not merely "not a dotted key") to catch that silent fallback, and verifies the schema's thunk-based message resolution follows live locale changes without a rebuild.

## Key elements

- **`copy(locale)`** — reads the `users` namespace from `mergedResources()` for a given locale; used to look up the expected strings.
- **`invalidUser`** — a deliberately invalid payload (`email`, `username`, `password` all fail) so a single parse triggers every message under test.
- **`messagesFor(locale)`** — calls `loadBeforeI18n` to initialize i18n _then_ dynamically import `../../model`, parses `invalidUser`, and returns the array of Zod issue messages.
- **`describe('user validation messages')`** — four tests:
    - English messages match the shipped EN strings.
    - Italian messages match the shipped IT strings.
    - IT strings differ from EN (guards against accidentally shipping English twice).
    - **"follows a locale change without the schema being rebuilt"** — inside `jest.isolateModulesAsync`, imports the schema once, parses in EN, calls `i18next.changeLanguage('it')`, parses again with the _same_ schema object, and asserts the messages switched. This is the property only a thunk (message resolved at parse-time) provides.

## Relationships

- **`src/modules/users/model.ts`** — the module under test. Provides `zodUserSchema`, whose validation messages are the subject of every assertion.
- **`tests/support/i18n-boot.ts`** — supplies `loadBeforeI18n` (initializes i18next before importing the target module) and `mergedResources` (the full resource bundle used for both setup and string lookups).

## Notes

- The last test deliberately uses `jest.isolateModulesAsync` to get a clean module registry, then imports `i18next` and the schema _inside_ that sandbox — a pattern that differs from the `loadBeforeI18n` helper used in the other tests.
- `loadBeforeI18n` accepts a third argument (`'users.field-email-invalid'`) that is presumably a key to verify as present, making the ordering dependency explicit rather than relying on import side-effects.
- All message assertions use `toContain` (not `toEqual` on the full array) so the tests remain resilient to rule reordering or additional rules being added to the schema.
