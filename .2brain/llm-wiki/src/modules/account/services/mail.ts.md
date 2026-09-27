---
source: src/modules/account/services/mail.ts
sha256: 9394d076be23573110a2adee0df1bcea6cc1678aa075330690a394ceafef70db
generated_at: 2026-09-27T14:29:38.491170+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/mail.ts

## Purpose

A single-function service-layer wrapper around `enqueueEmail`. It exists purely to satisfy the layering rule that all `enqueueEmail` calls originate from the service layer (enforced by `tests/cross-cutting/side-effects-have-one-layer.test.ts`). It is deliberately kept as its own one-function file — not folded into a larger service — so that `two-factor/methods/email.ts`, which is not itself a service, can import a mail-sending capability without pulling in an unrelated service's full surface.

## Key elements

- **`sendAccountMail(to, mail, priority?)`** — Queues a transactional email. Accepts a recipient address, a finished `EmailContent` object (subject + template + data, built by one of the `../emails.ts` builders), and an optional `JobPriority` (defaults to `'high'`). Delegates directly to `enqueueEmail`.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Provides `enqueueEmail` (the actual queuing send) and the `EmailContent` type consumed by `sendAccountMail`.
- **`src/infrastructure/adapters/queue.ts`** — Source of the `JobPriority` type used for the priority parameter.
- **`src/modules/account/two-factor/methods/email.ts`** — Non-service caller that imports `sendAccountMail` specifically because this file isolates the mail-sending function from other services.
- **`src/modules/account/services/index.ts`** — Barrel export; re-exports this module alongside sibling services.
- **`src/modules/account/services/authentication.ts`, `profile.ts`, `verification.ts`** — Sibling services in the same module that are the primary callers for time-sensitive sends (reset tokens, verification codes, etc.).

## Notes

- The `'high'` priority default is intentional: most sends in this module carry a token or a code the user is actively waiting on. The two exceptions (`resetConfirmEmail`, `deleteConfirmEmail`) pass `'normal'` explicitly at their call sites rather than relying on the default.
- Template construction, i18n strings, and subject assembly live in `../emails.ts` (the "copy layer"), *not* here. This file only wires the finished content into the queue.
- Do not add additional exports to this file; its single-purpose shape is what allows `two-factor/methods/email.ts` to depend on it in isolation.
