# src/modules/users/tests/unit/validation-messages.test.ts

## Purpose

Guards against **PROBLEM 01**: `t()` being called at module scope before `i18next.init()`, causing Zod to silently fall back to its built-in English defaults. Instead of merely checking that a message "isn't a dotted key" (which Zod defaults pass), these tests assert the **exact shipped i18n strings** for both `en` and `it`, and verify the schema resolves messages lazily per parse.

## Key elements

- **`copy(locale)`** — extracts the `users` translation namespace from `mergedResources()` for a given locale.
- **`invalidUser`** — fixture with an invalid email, too-short username, and too-short password, guaranteed to trigger three Zod issues.
- **`messagesFor(locale)`** — loads the users module *before* i18n init (via `loadBeforeI18n`), runs `zodUserSchema.safeParse(invalidUser)`, and returns the issue messages.
- **`'uses the English copy verbatim…'`** — asserts the three expected `en` strings appear in the parse errors.
- **`'uses the Italian copy…'`** — same assertion with `it` strings.
- **`'is actually translated…'`** — sanity-checks that the Italian and English `field-email-invalid` strings differ.
- **`'follows a locale change without the schema being rebuilt'`** — inside `jest.isolateModulesAsync`, initializes i18next once, parses in `en`, calls `i18next.changeLanguage('it')`, parses again on the **same** schema object, and asserts both language strings appear without any module re-import.

## Relationships

- **`src/modules/users/index.ts`** — the module under test; its exported `zodUserSchema` is the Zod schema whose error messages are asserted.
- **`tests/support/i18n-boot.ts`** — provides `loadBeforeI18n` (forces module load *before* i18n init to make the ordering real) and `mergedResources` (the combined i18n resource bundle used both for initialization and for extracting expected strings).

## Notes

- The last test (`jest.isolateModulesAsync`) exists because a thunk-based `t()` call resolves at parse time; an eagerly-resolved message string would not change after `changeLanguage`. This is the behavioral property the test locks in.
- `loadBeforeI18n` takes a *probe key* (`'users.field-email-invalid'`) so the boot helper can verify the key exists in resources before proceeding.
- The test file's header comment documents the historical guard gap (old test only checked for non-dotted-key shape) so future readers understand why exact-string assertions are intentional, not over-specified.
