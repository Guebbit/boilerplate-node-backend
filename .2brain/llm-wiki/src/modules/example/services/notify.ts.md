---
source: src/modules/example/services/notify.ts
sha256: b0182e86531e58d0c46dd88d80439fed60a136a729f42b9135088d549bf522aa
generated_at: 2026-10-29T03:55:59.771586+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/notify.ts

## Purpose

Event listener that mails the owner of an example when it is published. Registered by the module's `subscribe` call; the publishing service never knows this listener exists. It handles locale-aware email composition and account-state guards, then enqueues the email through the infrastructure mailer.

## Key elements

- **`mailOwnerOfPublished(payload)`** — sole export. Accepts `{ userId, title }` from the `example.published` event. Looks up the owner via `userService.getById`, skips silently if the owner is missing or not authenticatable (banned / pending-deletion), builds a localized email via `examplePublishedEmail`, and calls `enqueueEmail`.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — calls `enqueueEmail` to hand the rendered message to the outbound queue.
- **`src/infrastructure/i18n/index.ts`** (barrel) / **`catalog.ts`** — imports `getDefaultLocale` as a fallback when the owner has no explicit locale.
- **`src/modules/example/emails.ts`** — calls `examplePublishedEmail(locale, username, title)` to obtain the subject, template, and data for the mail.
- **`src/modules/example/module.ts`** — registers `mailOwnerOfPublished` as the handler for the `example.published` domain event via its `subscribe` call.
- **`src/modules/users/index.ts`** (barrel) / **`services/index.ts`** / **`authenticatable.ts`** — imports `userService.getById` to fetch the owner and `isAuthenticatable` to gate on account status.

## Notes

- **Idempotency is not guaranteed.** The event rides an outbox with retry; a retried delivery re-runs every handler, so the owner can receive the same email more than once.
- **Failures are silent to the caller.** A rejection here is swallowed by the event bus and logged there; it never propagates back into the request that triggered the publish.
- **Deletion check.** To remove this listener entirely, also delete `../emails.ts`, any entries under `../templates/`, and the corresponding `subscribe` line in `module.ts` — the file header documents this coupling.
