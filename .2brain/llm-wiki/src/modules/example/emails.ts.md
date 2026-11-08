---
source: src/modules/example/emails.ts
sha256: a7fa19099e7be8fa3bf0ee17e4976974726e1d302c4af47b79f8f5d28ee6570d
generated_at: 2026-11-08T05:50:00.926053+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/emails.ts

## Purpose
Translates the "example published" email copy into finished, locale-specific strings. It is the single place where the module's outgoing mail text is composed; actual sending is handled elsewhere. The file is intentionally a pure "string factory" — it resolves no templates and performs no I/O.

## Key elements
- **`examplePublishedEmail(locale, name, title): EmailContent`** — Builds the email payload an owner receives when their example goes public. Returns an object with:
  - `template`: the static key `'example.published'` (rendered later by the mailer).
  - `subject`: translated subject line.
  - `data`: an object carrying `locale`, `pageMetaTitle`, `greeting`, `body`, and a shared `footer` — all resolved through the i18n translator at call time.

## Relationships
- **`src/infrastructure/adapters/mailer.ts`** — Provides the `EmailContent` type that this file returns; the mailer adapter is what eventually consumes the returned object.
- **`src/infrastructure/i18n/index.ts`** — Source of the `translator` function used to resolve every string key.
- **`src/modules/example/services/notify.ts`** — The service that orchestrates sending; it calls `examplePublishedEmail` to obtain the payload before handing it to the mailer.
- **`src/modules/example/index.ts`** — Module barrel; re-exports this file so other modules can import `examplePublishedEmail` directly.
- **`src/modules/example/tests/unit/emails.test.ts`** — Unit tests covering the output shape and translation of `examplePublishedEmail`.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Tests the downstream rendering of the `'example.published'` template key emitted here.

## Notes
- The `subject` and `pageMetaTitle` in the returned object are **the same translated string** (`t('example.email-published.subject', …)`). If the two ever need to diverge, both call sites must be updated together.
- The `template` field is a static key; no interpolation happens here. The actual HTML/text rendering is deferred to the mailer adapter and its template engine.
- Per the module doc-block, this file (along with `services/notify.ts` and the templates directory) can be deleted as a unit if the module stops sending mail.
