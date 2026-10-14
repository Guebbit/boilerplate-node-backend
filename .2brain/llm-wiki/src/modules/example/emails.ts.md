---
source: src/modules/example/emails.ts
sha256: fc1f3e6c792b1e422bfe06c0f2db0e33ca48a23695c49c992b47e4e16f214437
generated_at: 2026-10-14T15:41:58.930314+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/emails.ts

## Purpose

Produces the finished email content (localized strings + template reference) sent to an owner when their example is published. It is the module-local file where each email's copy is resolved into concrete text before handing off to the mailer, keeping template rendering separate from copy composition.

## Key elements

- **`examplePublishedEmail(locale, name, title): EmailContent`** — Builds the "your example is now public" email. Calls `translator(locale)` to produce subject, greeting, body, and footer strings, then returns an `EmailContent` object with the template id `'example.published'` and a `data` bag consumed by the downstream renderer.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Source of the `EmailContent` type that `examplePublishedEmail` returns. This file only *imports the type*; it does not invoke any mailer logic.
- **`src/infrastructure/i18n/index.ts`** — Barrel re-export from which `translator` is imported. `src/infrastructure/i18n/context.ts` is the underlying implementation behind that re-export.
- **`src/modules/example/index.ts`** — Module barrel; re-exports `examplePublishedEmail` so that consumers (e.g. the notify service) import from the module root.
- **`src/modules/example/services/notify.ts`** — Expected caller: orchestrates the publish flow and invokes `examplePublishedEmail` to obtain the `EmailContent` before passing it to the mailer adapter.
- **`src/modules/example/tests/unit/emails.test.ts`** — Unit tests for this file's output shape and translated strings.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Tests the mailer-side template rendering for the `'example.published'` template that this file references by name.

## Notes

- The `data.pageMetaTitle` is set to the *same* translated subject string, not a separate key. If subject and page title need to diverge, both call sites must be updated.
- `pageMetaLinks` is always an empty array here; there is no per-example linking in this email variant.
- The template id (`'example.published'`) is a plain string with no import. The mailer adapter resolves it at render time — a typo will only surface at send/test time, not at import.
