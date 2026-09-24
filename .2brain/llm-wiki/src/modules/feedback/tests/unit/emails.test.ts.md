---
source: src/modules/feedback/tests/unit/emails.test.ts
sha256: 51e2dd1b631b907c696d4bcb495d7c5de300d9cecde39f990be8509f25d6f882
generated_at: 2026-09-23T18:42:37.898280+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/unit/emails.test.ts

## Purpose

Unit tests for the `contactRequestEmail` function — the notification email sent to an OPERATOR (not a customer) when a contact request / ticket is submitted. The suite pins down subject construction, data pass-through, name fallback, field labeling, and locale translation so that regressions in any of those behaviors are caught at the function boundary.

## Key elements

- **`REQUEST`** — A single `ContactRequest` fixture (name, email, subject, message, createdAt) reused across all assertions.
- **`describe('contactRequestEmail')`** — The sole test block. Contains six `it` cases:
  - *Template name* — asserts the returned `template` is `'feedback.contact'`.
  - *Subject composition* — asserts the mail subject ends with `": ${REQUEST.subject}"` and is **not** just the raw ticket subject (a translated prefix precedes it).
  - *Data pass-through* — asserts `data.name`, `data.email`, `data.subject`, `data.message`, `data.createdAt` are identical to the input; no reformatting.
  - *Name fallback* — asserts both `undefined` and `''` for `name` resolve to the same non-empty, non-raw-key translated string (documents the deliberate use of `||` over `??`).
  - *Field labels* — asserts `labelName`, `labelEmail`, `labelSubject`, `labelMessage`, `labelCreatedAt` are all non-empty and do not start with `feedback.` (i.e., they are translated, not raw i18n keys).
  - *Locale pass-through* — asserts `data.locale` matches the argument and that `data.title` differs between `'en'` and `'it'`.

## Relationships

- **`src/modules/feedback/emails.ts`** — Sole dependency. Exports the `contactRequestEmail` function under test and the `ContactRequest` type used to shape the fixture.

## Notes

- The fallback-name test intentionally exercises **both** `undefined` and `''`; the inline comment explains the choice of `||` over `??`. Any future refactor that switches to `??` will break the `blank` assertion.
- Several assertions use `.not.toMatch(/^feedback\./)` to guard against untranslated i18n keys leaking into rendered output — a convention that mirrors a prior bug where raw keys were shown to operators.
- The subject test checks `endsWith` rather than exact equality, acknowledging that the prefix text is locale-dependent and may change with copy updates.
