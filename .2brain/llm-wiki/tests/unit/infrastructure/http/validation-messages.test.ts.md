---
source: tests/unit/infrastructure/http/validation-messages.test.ts
sha256: a79144cacd66ce6e654d4bfcf756e96a919d0ec48ad9ac162540e14701e8bed8
generated_at: 2026-10-15T13:16:14.806101+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/validation-messages.test.ts

## Purpose

Verifies that the Zod global error map (installed by `registerValidationMessages`) produces the correct, translated, label-aware message for every error class the application can emit. It drives each assertion through a real `safeParse` call on a Zod schema—because the mapper lives on the Zod singleton, parsing is the only path a request ever takes through it—and asserts the resulting message against the shipped locale dictionary rather than against a retyped literal. The file exists to catch the silent failure mode where a message regresses to Zod's own English ("Invalid input"), which looks like a working message rather than a bug.

## Key elements

- **`render(key, values)`** — Renders a translated validation sentence using the same `translator('en', …)` the production map uses, so expectations never drift from the shipped copy.
- **`messageOf(schema, value)`** / **`messagesOf(schema, value)`** — Helpers that call `safeParse`, assert the parse failed, and return the first (or all) issue messages.
- **`field(name, schema)`** — Wraps a schema in a one-field object so the field's label is part of the assertion.
- **`beforeAll → registerValidationMessages()`** — Installs the custom error map on the Zod singleton once per suite.
- **Describe blocks** covering: required vs. type errors; label resolution (innermost label, unlabelled-segment fallback, neutral fallback, runtime locale switch to Italian); size constraints (string chars, number values, array/set items, exclusive bounds, singular forms); format validators (email, url, uuid, ISO datetime/date/time, bare regex fallback); named constraints (multipleOf, strictObject unrecognized keys, enum values); and fallback guards (refine with no message, union mismatch, multi-error translation).

## Relationships

- **`src/infrastructure/http/validation-messages.ts`** — The module under test; exports `registerValidationMessages`, which installs the custom error map onto the Zod singleton that every subsequent `safeParse` consults.
- **`src/infrastructure/i18n/catalog.ts`** — Provides `readLocaleDictionary`, used to load the `en` and `it` dictionaries as the source of truth for expected messages.
- **`src/infrastructure/i18n/context.ts`** — Provides `runWithLocale`, used in the "answers in the language of the request" test to switch the active locale at runtime.
- **`src/infrastructure/i18n/index.ts`** — Barrel re-export consumed by this file for `translator` (and indirectly `readLocaleDictionary`, `runWithLocale`).
- **`tests/unit/scripts/scaffold/demo-remove-validation-labels.test.ts`** — Companion test that exercises the scaffold script which strips validation label entries; shares the same `validation.attributes` dictionary structure that this file asserts against.

## Notes

- All expectations are rendered through `translator` with the **shipped dictionary** as the variable source—no sentence is retyped as a string literal in the test. If you add a new error branch, add a new dictionary key and a test that calls `render` with it.
- Pluralisation is treated as a separate sentence (`too-small-items` vs. `too-small-items-one`, etc.); the tests explicitly pin the singular form to prevent accidental pluralisation at count 1.
- The "nothing falls through to Zod English" block is a regression guard: it asserts that `.refine(() => false)` (no message) and `z.union` mismatches still produce a **translated** sentence, not Zod's default `"Invalid input"`.
- Label resolution is path-sensitive: the test for `translations: Record<string, …>` asserts the parent key's label is used when the record key itself has no label—this is the "skip an unlabelled segment" rule.
