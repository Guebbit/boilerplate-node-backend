---
source: src/modules/example/tests/unit/emails.test.ts
sha256: b54847eb749400a9d81bda1a9d32af697acc5b5b81032362b1cec50be9401685
generated_at: 2026-11-08T05:55:57.407487+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/emails.test.ts

## Purpose

Unit tests for the `examplePublishedEmail` function, verifying that the publish-notification email copy (subject, greeting, body) resolves correctly into finished strings for each supported locale.

## Key elements

- **`describe('examplePublishedEmail')`** — test suite scoped to the single exported function.
- **`it('names the title in the subject and the body, in the owner's language')`** — asserts the full English output: `template` equals `'example.published'`, `subject` contains the example title, and `data` carries the correct `locale`, `greeting`, and `body`.
- **`it('speaks Italian when the owner does')`** — asserts the Italian `subject` and `data.greeting` to confirm locale-specific copy.

## Relationships

- **`src/modules/example/emails.ts`** — the module under test. This file imports `examplePublishedEmail` and exercises its return value (an object with `template`, `subject`, and `data` fields) for two locales (`'en'`, `'it'`).

## Notes

- Only two locales are covered (`en`, `it`). Adding a new locale to `emails.ts` without a matching test case will go unverified here.
- Tests use `toMatchObject` on `data`, so additional fields beyond `locale`, `greeting`, and `body` are permitted without failing.
