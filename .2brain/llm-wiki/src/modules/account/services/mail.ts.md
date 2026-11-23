---
source: src/modules/account/services/mail.ts
generated_at: 2026-11-22T03:38:16.687669+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/mail.ts

## Purpose
A one-function module that is the account module's single entry point onto `enqueueEmail`. It exists for layering, not logic: the layer rule bans `enqueueEmail` calls in controllers, repositories and models (lint), so they must live in the service layer. It is kept separate from other services so that `src/modules/account/two-factor/methods/email.ts`, which is not a service, can import it without pulling in a whole service's unrelated surface.

## Key elements
- `sendAccountMail(to, mail, options?)` queues one of the module's own mails.
  - `to` is the recipient address.
  - `mail` is an `EmailContent` (template, subject, data) built by one of the builders in the copy layer (template and translated strings), `emails.ts` in the parent directory.
  - `options.urgent` sends the mail on the urgent queue. It defaults to normal.
  - It calls `enqueueEmail({ to, subject: mail.subject }, mail.template, mail.data, options)` and returns `Promise<void>`.

## Relationships
- **`src/infrastructure/adapters/mailer.ts`**: provides `enqueueEmail` and the `EmailContent` type, which this file wraps.
- **`src/modules/account/two-factor/methods/email.ts`**: a non-service that reaches the mailer through this file.
- **Sibling services** (the `account-deletion`, `email-change`, `export-job`, `oauth`, `password*`, `purge-deletions`, `two-factor-outcomes` and `verification` services, plus the `index.ts` barrel) are neighbors in the dependency graph, and send their mails through this helper.

## Notes
- `sendAccountMail` never rejects, because `enqueueEmail` logs its own failures. Callers don't need error handling around it.
- Use `urgent` only for mails a person is waiting on at a screen: verification link, reset link, two-factor code, export-ready link, deletion link. Urgent mails use their own queue so ordinary mail never waits ahead of them.
- The file's header comment points to a layers document (`layers.md`, section "layer-stack-inside-one-module") for the layer rationale.
