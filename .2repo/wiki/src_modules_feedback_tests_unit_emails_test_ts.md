# src/modules/feedback/tests/unit/emails.test.ts

## Purpose

Unit tests for `contactRequestEmail`, the builder that assembles the notification email an **operator** receives when a customer submits a contact request. The suite pins down decisions that are easy to regress silently: subject-line composition, name fallback semantics, field labeling, and locale propagation.

## Key elements

- **`REQUEST`** – A single `ContactRequest` fixture (Ada Lovelace, a parcel-not-arrived ticket) shared by all cases to keep each assertion focused on one behavior.
- **`describe('contactRequestEmail')`** – Six `it` blocks:
  - *names the contact template* – asserts `template === 'feedback.contact'`.
  - *subject composition* – verifies the mail subject ends with `: <ticket subject>` and is not just the bare subject.
  - *data passthrough* – confirms `name`, `email`, `subject`, `message`, `createdAt` arrive in `data` unchanged (these are reply-to fields).
  - *name fallback* – exercises both `name: undefined` and `name: ''`; both must yield the same non-blank, non-key translated placeholder.
  - *field labels* – checks `labelName`…`labelCreatedAt` are non-empty and not raw `feedback.*` i18n keys.
  - *locale propagation* – calls with `'en'` and `'it'`; asserts `data.locale` matches and that at least one rendered string (title) differs.

## Relationships

- **Imports** `contactRequestEmail` (function) and `ContactRequest` (type) from `src/modules/feedback/emails.ts`. That file is the sole unit under test; no other module is touched.

## Notes

- The fallback test deliberately uses `||` semantics (empty string treated as missing), not `??`. If the implementation switches to `??`, the `name: ''` case will start rendering a blank line and the test will catch it.
- Label assertions check `not.toMatch(/^feedback\./)` to guard against a translation key leaking into the rendered email body.
- The subject test asserts `endsWith(': ' + subject)` rather than equality, leaving room for an arbitrary translated prefix without coupling the test to specific English copy.
