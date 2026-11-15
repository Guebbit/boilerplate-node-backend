---
source: src/modules/account/services/mail.ts
sha256: b5610648b33d829d6b817f09ff023141447ec94e3ba2d6f63999583630fb620c
generated_at: 2026-11-14T18:45:57.435884+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/mail.ts

## Purpose

Single-export shim that centralises every `enqueueEmail` call in the account service layer. It exists to satisfy the lint rule that bans `enqueueEmail` outside the service layer, and to give `two-factor/methods/email.ts` (not itself a service) a minimal import target without dragging in an entire service's unrelated API.

## Key elements

- **`sendAccountMail(to, mail, priority?)`** — The only export. Accepts a recipient address, a finished `EmailContent` object (subject + template + data, built by `../emails.ts` builders), and an optional `JobPriority`. Delegates directly to `enqueueEmail`. Defaults `priority` to `'high'`; the two "confirmation" sends (`resetConfirmEmail`, `deleteConfirmEmail`) pass `'normal'` explicitly at their call sites.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports `enqueueEmail` and the `EmailContent` type; this file is the sole call-site wrapper for that adapter within the account module.
- **`src/infrastructure/adapters/queue.ts`** — Imports the `JobPriority` type to type the `priority` parameter.
- **`src/modules/account/services/index.ts`** — Re-exports `sendAccountMail` so consumers can import from the barrel.
- **Account services that call it** — `account-deletion.ts`, `email-change.ts`, `export-job.ts`, `oauth.ts`, `password-reset-request.ts`, `password-reset.ts`, `password.ts`, `purge-deletions.ts`, `two-factor-outcomes.ts`, and `verification.ts` each import `sendAccountMail` instead of calling the mailer adapter directly.
- **`src/modules/account/two-factor/methods/email.ts`** — Imports `sendAccountMail` for 2FA-code emails; the file exists in part so this non-service method can reach the mailer without importing a full service.

## Notes

- `sendAccountMail` **never rejects**; `enqueueEmail` logs and swallows its own failures. Callers need no `try/catch`.
- The `'high'` default is deliberate: most account mails carry a time-sensitive token or code. If you add a new send that is a non-urgent confirmation, pass `'normal'` explicitly rather than changing the default.
- Template/subject/data construction lives in `../emails.ts` (the "copy layer"), **not** here. This file is purely the queue-handoff step.
