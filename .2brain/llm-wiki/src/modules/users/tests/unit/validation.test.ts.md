---
source: src/modules/users/tests/unit/validation.test.ts
sha256: c520a36d172977f8e44bd0069d2bf317e576eae315d1035cdaa4800a6c2e4fcc
generated_at: 2026-09-23T19:37:35.325510+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/validation.test.ts

## Purpose

Exercises the ten message thunks in `zodUserSchema` at **parse time**, which is the only moment they actually run. Because a Zod schema is a declaration, import-time coverage reports 100 % whether or not a thunk ever fires; this file closes that gap. It also pins the distinction between `error: t('…')` (resolves at import, before `i18next.init()`, silently falling back to English) and the correct `error: () => t('…')`, and guards against a message being attached to the wrong rule.

## Key elements

- **`validUser`** – A payload that satisfies every rule, so each failing test breaks exactly one field.
- **`copy(key)`** – Reads the shipped English string from `en.json` via `readLocaleDictionary`; assertions compare against this source of truth rather than hard-coded literals.
- **`messagesFor(payload, field)`** – Parses with `zodUserSchema.safeParse`, filters `error.issues` to the target field, and returns the flat message strings.
- **`describe('email messages')`** – Verifies `field-email-required` vs `field-email-invalid` are distinct and attached to the correct rules.
- **`describe('username messages')`** – Verifies `field-username-required` vs `field-username-min`; the `'ab'` case separates `min(1)` from `min(3)`.
- **`describe('password messages')`** – Covers required, min-length (boundary read from `createUserBodyPasswordMin`), lowercase, uppercase, digit, and symbol thunks. Also asserts that length alone is insufficient (complexity is enforced server-side).
- **`describe('inherited rules')`** – Confirms fields from the generated `CreateUserBody` base schema (`role`, `active`, `imageUrl`) are still validated, guarding against a broken `.extend()`.

## Relationships

- **`src/modules/users/model.ts`** – Provides `zodUserSchema`, the system under test.
- **`src/infrastructure/i18n/index.ts`** – Exports `readLocaleDictionary`, used to load `en.json` so assertions reference the same copy the thunks resolve against.
- **`src/infrastructure/i18n/catalog.ts`** – The locale dictionary file that `readLocaleDictionary` reads; the `users.*` keys are what `copy()` looks up.
- **`src/modules/users/factories.ts`** – Supplies `PLAIN_PASSWORD`, the valid password used in the baseline payload.
- **`src/modules/users/tests/factories.ts`** – Supplies `MINIMAL_PASSWORD`, a password at exactly the contract minimum with all complexity requirements met.

## Notes

- Password minimum-length boundary is **not hard-coded**; it is derived from `createUserBodyPasswordMin` (generated from `openapi.yaml`), so the test tracks contract changes automatically.
- The "inherited rules" test uses `active` (boolean) rather than `role` (string) as the type-break probe: a boolean field can be meaningfully given a string (`'yes'`), whereas a string field's "wrong type" is less unambiguous.
- Each "not-to-contain" assertion (e.g. `not.toContain(copy('field-email-required'))` in the invalid-email test) is intentional: it catches the case where the correct message is present but the *wrong* message is also attached, which would indicate the thunk is bound to the wrong Zod rule.
