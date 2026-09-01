# src/modules/feedback/tests/unit/emails.test.ts

## Purpose

Unit tests for `contactRequestEmail`, verifying that the operator-facing notification email is assembled correctly: the right template is chosen, the subject embeds the ticket's own subject after a translated prefix, all sender fields pass through unchanged, missing/blank names fall back to translated copy, every field carries a translated label, and locale drives the translation.

## Key elements

- **`REQUEST: ContactRequest`** — shared fixture (Ada Lovelace, fixed date) reused by every test case.
- **`it('names the contact template')`** — asserts `template === 'feedback.contact'`.
- **`it('puts the ticket"s own subject in the mail subject, after the prefix')`** — asserts the subject *ends* with `: ${REQUEST.subject}` and is not equal to the raw subject alone.
- **`it('passes the sender"s details through unchanged')`** — asserts `name`, `email`, `subject`, `message`, `createdAt` in `data` match the input exactly (these are reply-to fields; altering them breaks the reply path).
- **`it('falls back to translated copy when the sender left no name')`** — feeds both `name: undefined` and `name: ''`; asserts both resolve to the same non-empty, non-i18n-key value.
- **`it('labels every field…')`** — iterates `labelName`–`labelCreatedAt`; asserts each is non-empty and does not match `/^feedback\./` (i.e., a real translation, not a raw key).
- **`it('carries the locale through and translates by it')`** — compares `en` vs `it` output; asserts `data.locale` is preserved and `title` differs between locales.

## Relationships

- **`src/modules/feedback/emails.ts`** — sole import source. The test imports `contactRequestEmail` (the function under test) and the `ContactRequest` type (used to type the fixture). No other modules are touched.

## Notes

- The name-fallback test explicitly validates that `''` and `undefined` behave identically, locking in the `||` (not `??`) contract in the implementation.
- Label assertions reject any value matching `/^feedback\./`, guarding against untranslated i18n keys leaking into the rendered email.
- The subject test checks `endsWith(': …')` rather than mere containment, enforcing the exact `prefix: subject` composition rather than a looser inclusion.
