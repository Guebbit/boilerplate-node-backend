# src/modules/users/tests/unit/validation.test.ts

## Purpose

Unit tests that verify `zodUserSchema`'s i18n error-message thunks resolve to the correct English copy at validation time. They exist because import-time coverage tools report 100 % on the schema declaration regardless of whether the `() => t('…')` thunks ever execute; these tests force each thunk to run and confirm the message matches the shipped `en.json` entry, catching regressions like eager `t('…')` calls (which resolve before `i18next.init()` and silently fall back to English) or a message attached to the wrong rule.

## Key elements

- **`en` / `copy(key)`** – Loads the shipped English locale dictionary via `readLocaleDictionary('en')` and exposes a helper that retrieves a user-scoped string by key. All assertions compare against this ground truth rather than hard-coded literals.
- **`validUser`** – A baseline payload that passes every schema rule, so each test can mutate exactly one field.
- **`messagesFor(payload, field)`** – Runs `zodUserSchema.safeParse`, then extracts and returns only the error messages whose `issue.path[0]` matches the given field.
- **`describe('email messages')`** – Asserts that empty email yields `field-email-required` and a malformed address yields `field-email-invalid` (and *not* the required copy).
- **`describe('username messages')`** – Asserts empty username → `field-username-required`; a 2-char username → `field-username-min` (distinguishes `min(1)` from `min(3)`).
- **`describe('password messages')`** – Asserts empty password → `field-password-required`; one character below `createUserBodyPasswordMin` → `field-password-min`; exactly the minimum length → no errors.
- **`describe('inherited rules')`** – Confirms fields that `zodUserSchema` does not override (e.g. `admin`) are still validated, guarding against a future `.extend()` that accidentally replaces the base schema.

## Relationships

- **`src/modules/users/index.ts`** – Barrel re-export of `zodUserSchema`; the test imports the schema through this path.
- **`src/modules/users/model.ts`** – Defines `zodUserSchema` (built on top of the generated `CreateUserBody` via `.extend()`). The test exercises its rules and message thunks.
- **`src/infrastructure/i18n/index.ts`** – Barrel export that provides `readLocaleDictionary`, used to load the English dictionary for assertions.
- **`src/infrastructure/i18n/catalog.ts`** – The underlying catalog file whose `en.json` entries the thunks resolve against; the test reads the same file to build its expected strings.

## Notes

- The password-minimum boundary is derived from `createUserBodyPasswordMin` (imported from `@api/schemas.zod`) rather than a hard-coded number, so the test tracks changes to `openapi.yaml` automatically.
- Each "wrong copy" assertion is paired with a `not.toContain` for the adjacent message, ensuring the thunk is bound to the correct Zod rule (e.g. `min` vs. `required`).
- The "inherited rules" test is intentionally minimal (just checks that a type-coercible invalid `admin` fails); it is a smoke guard, not a full validation of every base field.
