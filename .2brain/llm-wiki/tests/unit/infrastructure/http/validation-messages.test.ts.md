---
source: tests/unit/infrastructure/http/validation-messages.test.ts
sha256: 9d0bc249d8c17de3741fd153ee80f9d6d4fdaa24c3e1c7dd99dceb3e23071a30
generated_at: 2026-09-23T20:23:55.887874+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/validation-messages.test.ts

## Purpose

Verifies that Zod's global error map — installed once via `registerValidationMessages` — emits the project's English i18n copy for every validation failure it handles. The file drives real schema parses (not the mapper directly) because that is the only path a request takes, and its central concern is catching the silent case where a message falls back to Zod's built-in English and looks like a valid message rather than a bug.

## Key elements

- **`copy`** — the shipped English `validation` sub-dictionary extracted from `readLocaleDictionary('en')`; every expectation references these values instead of retyping sentences.
- **`messageOf(schema, value)`** — safe-parses, asserts failure, returns the first issue's message.
- **`messagesOf(schema, value)`** — same but returns all issue messages.
- **`beforeAll → registerValidationMessages()`** — installs the error map on the Zod singleton before any test runs.
- **`describe` groups:**
    - _missing vs. wrong-type field_ — `required` vs. `invalid-type` vs. explicit `null`.
    - _size constraints_ — string min/max (characters), number min/max (value), array min/max (items), Set min (items).
    - _formats_ — email, url, uuid, datetime, date, time, plus the generic fallback for an unnamed regex.
    - _remaining named constraints_ — `multipleOf`, `strictObject` unrecognized-keys listing, enum accepted-values listing.
    - _nothing falls through to Zod English_ — bare `.refine()`, unmatched union, and a multi-error parse asserting every message starts with a known i18n prefix.

## Relationships

- **`src/infrastructure/http/validation-messages.ts`** — the module under test; supplies `registerValidationMessages` which installs the error map on Zod.
- **`src/infrastructure/i18n/index.ts`** — re-exports `readLocaleDictionary`, used here to load the English dictionary that the assertions compare against.
- **`src/infrastructure/i18n/catalog.ts`** — source of the dictionary data behind `readLocaleDictionary`; changes to the shipped copy are picked up automatically by these tests.

## Notes

- Expectations are derived from the live i18n dictionary, so updating a sentence in the catalog updates the test's expected value with no edit here — but also means a typo in the dictionary will silently pass both production and test.
- `messageOf`/`messagesOf` assert `result.success === false`; if a test accidentally uses a schema that _passes_, the helper throws a misleading "expected false to be true" error rather than a message mismatch.
- The final multi-error test builds a `Set` of all dictionary sentence prefixes (split on `{{`) and checks that every issue message starts with one of them — the broadest guard against any Zod-default leaking through.
- Jest/Vitest globals (`describe`, `it`, `expect`, `beforeAll`) are used without imports, implying the project's test runner injects them.
