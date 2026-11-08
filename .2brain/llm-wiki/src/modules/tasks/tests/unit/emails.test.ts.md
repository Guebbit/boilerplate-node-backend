---
source: src/modules/tasks/tests/unit/emails.test.ts
sha256: 703055c94ba3832f5fcb2603a986acf8f6c1b847893f22021ff9b57e238614fe
generated_at: 2026-11-08T08:41:18.467848+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/tests/unit/emails.test.ts

## Purpose

Unit tests for the two email-builder functions exported by `src/modules/tasks/emails.ts`. They pin down the operator-facing subject-line grammar, the shape and locale of the template data payload, the reminder-variant copy, and the privacy guarantee that no sender address leaks into an erasure-notice payload.

## Key elements

- **`REQUEST`** – A single typed `ContactRequest` fixture (id, name, email, subject, message, createdAt) shared by most assertions to keep them concise.
- **`describe('contactRequestEmail', …)`** – The bulk of the file. Verifies:
  - Template key is `tasks.contact`.
  - Subject is `{translated prefix} [#last-8-of-id] [privacy?] : {task subject}`; the task subject is always the trailing segment.
  - `reminder: 'overdue'` vs `'due-soon'` produce distinct subject prefixes and `data.title` copy while preserving the task subject and `[#ref]`.
  - Sender fields (name, email, subject, message, createdAt) pass through unchanged.
  - `category` maps to a display word (`privacy` → "Personal data", `order` → "Order", absent → "Uncategorised").
  - `orderNumber`, `/tasks/{id}` link, and the sender's message body all appear in both `data` and the plain-text `mail.text` part.
  - A missing **or empty** `name` falls back to a translated placeholder (never blank, never a raw i18n key).
  - Every form label (`labelName`, `labelEmail`, etc.) is a non-empty translated string.
  - `data.locale` reflects the locale argument and translated copy differs between `en` and `it`.
- **`describe('erasureNoticeEmail', …)`** – Confirms the subject lists only `[#ref]` identifiers for the deleted messages and that `mail.data` contains no `@` (no email addresses).

## Relationships

- **`src/modules/tasks/emails.ts`** (sole import) – Provides `contactRequestEmail`, `erasureNoticeEmail`, and the `ContactRequest` type. This test file is the only consumer in the graph that exercises those builders in isolation; no other module is imported.

## Notes

- The name-fallback test intentionally checks **both** `undefined` and `''` to lock in `||` (not `??`) semantics in the implementation; the form UI permits an empty string.
- The `[privacy]` tag appears in the subject **only** when `category === 'privacy'`; the test asserts its absence otherwise.
- The `[#ref]` in the subject is always the **last 8 characters** of the Mongo-style id (`id.slice(-8)`), and it must be identical between the first mail and any reminder.
- `mail.text` is the plain-text MIME part; tests assert it is a superset of the relevant `data` values (message, order number, link), not merely the HTML body.
