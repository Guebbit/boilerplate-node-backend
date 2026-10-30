---
source: src/modules/account/services/mail.ts
sha256: 29d8f4314ff63dda902d3ea2b9922178b890e280b884997b6809ae9bceffbbde
generated_at: 2026-10-29T02:41:35.156187+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/mail.ts

## Purpose

A single-function seam that is the **only** service-layer call site for `enqueueEmail` in the account module. It exists purely for layering: a cross-cutting test enforces that all email enqueuing originates in the service layer, and keeping this as a one-function file lets non-service callers (e.g. `two-factor/methods/email.ts`) reach it without importing an unrelated service's full surface.

## Key elements

- **`sendAccountMail(to, mail, priority?)`** — The sole export. Wraps `enqueueEmail` with a convenience signature: takes a recipient address, a pre-built `EmailContent` (subject + template + data from the sibling `../emails.ts` builders), and an optional `JobPriority`. Never rejects — `enqueueEmail` swallows and logs its own failures.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports `enqueueEmail` (the actual queue-and-send function) and the `EmailContent` type.
- **`src/infrastructure/adapters/queue.ts`** — Imports the `JobPriority` type used for the priority parameter.
- **`src/modules/account/two-factor/methods/email.ts`** — Explicitly named in the module doc as a caller that benefits from this file being isolated from any single service.
- **`src/modules/account/services/account-deletion.ts`** and **`password-reset-request.ts` / `password-reset.ts`** — The two call sites that pass `'normal'` priority (`deleteConfirmEmail`, `resetConfirmEmail`); every other account service that sends mail uses the default `'high'`.
- **`src/modules/account/services/index.ts`** — Barrel that re-exports this alongside the other account services.
- All other account services (`email-change`, `export-job`, `oauth`, `password`, `purge-deletions`, `two-factor-outcomes`, `verification`) funnel through `sendAccountMail` for their outbound mail.

## Notes

- **Priority default is `'high'` on purpose.** The rationale is in the JSDoc: nearly every account email carries a time-sensitive token or code. Only the two "confirmation" mails (password-reset confirmation, account-deletion confirmation) are non-urgent and override to `'normal'` at their call site — do not change the default without auditing those two callers.
- **Do not add logic here.** The module is deliberately one function. If a caller needs conditional branching around sending, that belongs in the calling service, not in this seam.
- **`EmailContent` shape comes from `../emails.ts`**, not from this file. This module never builds templates or translated strings; it only hands the finished payload to the mailer.
