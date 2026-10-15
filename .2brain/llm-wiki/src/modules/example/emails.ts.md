---
source: src/modules/example/emails.ts
sha256: 56eff66b76182b5887f0f7ca60ca07b9a0fcb55fb3d09b545582afc718339131
generated_at: 2026-10-15T10:30:19.018385+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/emails.ts

## Purpose

Produces the finished, language-specific email copy (subject, greeting, body, footer) that an owner receives when their example is published. The file is a pure text-shaping layer: it receives a locale and a few display values, runs them through the i18n translator, and returns a typed `EmailContent` object ready for the mailer adapter to dispatch. No rendering or logic resolution happens here.

## Key elements

- **`examplePublishedEmail(locale, name, title): EmailContent`** — The sole export. Returns an object with:
  - `template`: the static string `'example.published'` (resolved later by the mailer adapter).
  - `subject`: translated via key `example.email-published.subject`.
  - `data`: an object carrying `locale`, `pageMetaTitle`, `greeting`, `body`, and `footer`, each filled from their respective i18n keys.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Supplies the `EmailContent` type that `examplePublishedEmail` returns.
- **`src/infrastructure/i18n/index.ts` / `src/infrastructure/i18n/context.ts`** — Provide the `translator` factory used to look up every string in this file.
- **`src/modules/example/index.ts`** — Module barrel; re-exports this file so other code in the example module (or external consumers) can import `examplePublishedEmail`.
- **`src/modules/example/services/notify.ts`** — Expected caller that invokes `examplePublishedEmail` and hands the result to the mailer adapter.
- **`src/modules/example/tests/unit/emails.test.ts`** — Unit tests for `examplePublishedEmail`.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Tests the `'example.published'` template that this file references by name.

## Notes

- `subject` and `data.pageMetaTitle` are populated from the **same** i18n key (`example.email-published.subject`). This is intentional (the page-meta title mirrors the subject) but easy to miss when editing translations.
- The `template` field is a plain string identifier, not a file path or component. The mailer adapter is responsible for mapping it to actual markup; this file "resolves nothing" (per the module doc).
- The `locale` value is passed through into `data` as-is, meaning downstream template rendering can also localise without a second translation call here.
