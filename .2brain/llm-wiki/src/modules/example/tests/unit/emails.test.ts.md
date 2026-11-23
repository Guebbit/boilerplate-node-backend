---
source: src/modules/example/tests/unit/emails.test.ts
source_sha256: b54847eb749400a9d81bda1a9d32af697acc5b5b81032362b1cec50be9401685
context_sha256: fb29156e35190b7ad3a9b11c674530f02638ca440952dbfa07159413e1209e67
generated_at: 2026-11-22T05:14:51.180932+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/tests/unit/emails.test.ts

## Purpose
Unit tests for `examplePublishedEmail`, the function that builds the "example published" notification mail. They check that the subject and body copy are resolved into finished strings in the owner's language (English and Italian).

## Key elements
- `describe('examplePublishedEmail')`: the single test suite.
- English test: calls `examplePublishedEmail('en', 'Ada', 'Hello')` and expects:
  - `template` is `'example.published'`.
  - `subject` is `'Your example is published: Hello'`.
  - `data` contains `locale: 'en'`, `greeting: 'Hello, Ada!'` and `body: '"Hello" is now public. Anyone can read it.'`.
- Italian test: calls `examplePublishedEmail('it', 'Ada', 'Ciao')` and expects:
  - `subject` is `'Il tuo esempio è pubblicato: Ciao'`.
  - `data.greeting` is `'Ciao, Ada!'`.

## Relationships
- Imports `examplePublishedEmail` from `src/modules/example/emails.ts` (via `../../emails`), the only unit under test.
- The call signature the tests use is `(locale, ownerName, title)`. The returned object exposes `template`, `subject` and `data`.

## Notes
- `data` is checked with `toMatchObject`, so extra fields in `data` do not fail the tests.
- The tests cover only the `en` and `it` locales. They do not cover other languages or fallback behavior.
- The tests use the global `describe`/`it`/`expect`, with no explicit import.
