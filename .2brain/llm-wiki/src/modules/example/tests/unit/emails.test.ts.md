---
source: src/modules/example/tests/unit/emails.test.ts
sha256: b54847eb749400a9d81bda1a9d32af697acc5b5b81032362b1cec50be9401685
generated_at: 2026-10-15T10:31:09.574946+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/tests/unit/emails.test.ts

## Purpose
Unit tests for the `examplePublishedEmail` helper, verifying that the published-example email copy (subject, greeting, body) is correctly resolved for a given locale and owner name.

## Key elements
- **`describe('examplePublishedEmail')`** — test suite covering two locale scenarios.
- **English case** — calls `examplePublishedEmail('en', 'Ada', 'Hello')` and asserts:
  - `mail.template` is the fixed string `'example.published'`
  - `mail.subject` includes the title
  - `mail.data` contains `locale`, a personalised `greeting`, and a `body` mentioning the title
- **Italian case** — calls `examplePublishedEmail('it', 'Ada', 'Ciao')` and asserts the translated `subject` and `greeting`.

## Relationships
- **`src/modules/example/emails.ts`** — sole import target; provides the `examplePublishedEmail` function under test (signature: `(locale: string, ownerName: string, title: string)` → `{ template, subject, data }`).

## Notes
- Assertions on `mail.data` use `toMatchObject`, so the function may return additional properties beyond `locale`, `greeting`, and `body` without failing the test.
- The Italian test does **not** assert on `mail.body` or `mail.template`; only `subject` and `greeting` are checked for that locale.
- The function accepts positional string arguments (locale code, owner name, title) rather than an options object.
