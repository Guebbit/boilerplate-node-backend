---
source: src/modules/account/services/mail.ts
sha256: 29d8f4314ff63dda902d3ea2b9922178b890e280b884997b6809ae9bceffbbde
generated_at: 2026-11-08T04:19:09.575762+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/mail.ts

## Purpose

A single-function service-layer wrapper around `enqueueEmail`. It exists solely to satisfy the architectural rule (enforced by `tests/cross-cutting/side-effects-have-one-layer.test.ts`) that every `enqueueEmail` call must originate from the service layer, rather than from the copy/template layer (`../emails.ts`) or from non-service modules like `two-factor/methods/email.ts`.

## Key elements

- **`sendAccountMail(to, mail, priority?)`** — the module's only export. Delegates to `enqueueEmail` with the recipient, subject, template, and data from the provided `EmailContent`. Defaults `priority` to `'high'` (token-bearing links, codes awaiting a user); callers that send pure confirmations (`resetConfirmEmail`, `deleteConfirmEmail`) pass `'normal'` explicitly. Never rejects — `enqueueEmail` handles its own failure logging.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — imports `enqueueEmail` (the actual send) and the `EmailContent` type.
- **`src/infrastructure/adapters/queue.ts`** — imports the `JobPriority` type used for the priority parameter.
- **`src/modules/account/two-factor/methods/email.ts`** — caller; a non-service module that needs a service-layer door to queue email without importing an unrelated service's surface.
- **Other account service modules** (`password-reset-request`, `password-reset`, `account-deletion`, `verification`, `oauth`, `email-change`, `export-job`, `purge-deletions`, `password`, `two-factor-outcomes`) — callers that pass a finished `EmailContent` (built by `../emails.ts` template builders) to `sendAccountMail`.
- **`src/modules/account/services/index.ts`** — barrel file that re-exports this module.

## Notes

- This is deliberately a one-function file. Do **not** fold it into an existing service (e.g. `verification.ts`): the isolation exists so non-service callers like `two-factor/methods/email.ts` can import only the email-sending surface without dragging in unrelated service logic.
- Priority defaulting to `'high'` is intentional and opinionated: the assumption is that the vast majority of account-module emails are time-sensitive (OTP codes, verification/reset links). If you add a new send that is *not* time-sensitive, pass `'normal'` explicitly rather than changing the default.
- The function never throws to the caller — error handling is entirely inside `enqueueEmail`. Callers can `void` the returned promise without a `.catch`.
