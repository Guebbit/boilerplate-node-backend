# src/modules/users/tests/unit/validation.test.ts

## Purpose

Guards the ten i18n message thunks in `zodUserSchema` against two failure modes that import-time coverage cannot detect: (1) messages resolved eagerly at import (before `i18next.init()`) instead of lazily, and (2) a message attached to the wrong Zod rule. It does this by asserting the exact English copy string that each rejection path should produce, read directly from the same locale dictionary the thunks resolve against.

## Key elements

- **`validUser`** — a fixture that satisfies every rule in `zodUserSchema`, so each test can violate exactly one field.
- **`messagesFor(payload, field)`** — runs `zodUserSchema.safeParse(payload)` and returns the flat array of `.message` strings whose `issue.path[0]` matches `field`. Returns `[]` on success.
- **`copy(key)`** / **`en`** — loads the shipped English dictionary via `readLocaleDictionary('en')` and exposes `en.users[key]`, giving each assertion a ground-truth string from the same file the thunks read.
- **`createUserBodyPasswordMin`** (imported from `@api/schemas.zod`) — the OpenAPI-derived minimum password length; used so the boundary test tracks contract changes automatically.
- **Test suites** — `email messages`, `username messages`, `password messages` (including lowercase/uppercase/digit/symbol complexity), and `inherited rules` (verifies `.extend()` did not drop base-schema fields like `admin`, `active`, `imageUrl`).

## Relationships

- **`src/modules/users/index.ts`** — re-exports `zodUserSchema`, the system under test.
- **`src/modules/users/model.ts`** — defines `zodUserSchema` (the Zod object whose message thunks are exercised here).
- **`src/infrastructure/i18n/index.ts`** — exports `readLocaleDictionary`, which this file calls to obtain the English copy for assertions.
- **`src/infrastructure/i18n/catalog.ts`** — the catalog behind `readLocaleDictionary`; the `en` object ultimately reflects its `users` section.

## Notes

- The most important invariant: `error: () => t('…')` (lazy thunk) vs. `error: t('…')` (eager). The latter resolves at import time, before i18n is initialized, so Zod silently falls back to English. Because this test asserts the *resolved* string against `en.json`'s own copy, a premature-evaluation bug that produces the same English text would still pass — the real protection is that a *different* (wrong-rule) message would not match.
- The "not the required copy" negative assertions (e.g., `not.toContain(copy('field-email-required'))`) are what distinguish adjacent rules like `min(1)` vs. `min(3)` or `email-format` vs. `required`.
- The password-min test intentionally reads the length from the generated schema constant rather than hard-coding a number, so an OpenAPI contract change shifts the boundary without leaving a stale literal.
- The `inherited rules` suite exists specifically to catch a regression where `.extend()` is replaced by an assignment, which would silently stop validating `admin`, `active`, and `imageUrl`.
