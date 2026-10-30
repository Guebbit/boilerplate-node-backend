---
source: src/modules/example/emails.ts
sha256: a7fa19099e7be8fa3bf0ee17e4976974726e1d302c4af47b79f8f5d28ee6570d
generated_at: 2026-10-29T03:52:49.553792+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/emails.ts

## Purpose
Turns the "example published" email copy into finished, locale-aware strings. It is the single source of truth for what text the owner receives when they publish an example — language is an input, plain text is the output, and no template rendering happens here.

## Key elements
- **`examplePublishedEmail(locale, name, title): EmailContent`** — The module's only export. Resolves all copy through the i18n `translator` and returns an `EmailContent` object with:
  - `template`: static key `'example.published'` (resolved downstream by the mailer adapter).
  - `subject`: translated string (key `example.email-published.subject`).
  - `data`: object carrying `locale`, `pageMetaTitle`, `greeting`, `body`, and `footer` — each a pre-translated string.

## Relationships
- **`@infrastructure/adapters/mailer`** (`src/infrastructure/adapters/mailer.ts`) — Provides the `EmailContent` type that shapes the return value. The mailer adapter is responsible for resolving the `template` key and rendering the body later.
- **`@infrastructure/i18n`** (`src/infrastructure/i18n/index.ts` / `context.ts`) — Provides the `translator` factory used to produce locale-specific strings.
- **`src/modules/example/services/notify.ts`** — The service layer that calls `examplePublishedEmail` and hands the result to the mailer for dispatch.
- **`src/modules/example/index.ts`** — Module barrel; re-exports this function for consumers outside the module.
- **`src/modules/example/tests/unit/emails.test.ts`** — Unit tests covering the exported function.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Validates that the `template` key (`'example.published'`) exists and renders correctly in the mailer.

## Notes
- This file is **pure**: it never sends mail, hits the network, or resolves template files. It only composes strings.
- `subject` and `data.pageMetaTitle` deliberately use the **same** i18n key (`example.email-published.subject`) so they stay in sync.
- The `template` field is a **key**, not a path. Anything that needs the rendered HTML/body must go through the mailer adapter.
- Per the module docblock: delete this file (along with `services/notify.ts` and the `templates/` directory) if the module stops sending email.
