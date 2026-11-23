---
source: src/modules/example/services/notify.ts
source_sha256: 41645677afbc2144a489b250b69c682765d21e189b4fe978597fe572ab6ddc77
context_sha256: 95346de97430e7c87dd5ae81cfdff2fda15dd2bc273cb5323d23e094ee32b2bb
generated_at: 2026-11-22T05:12:31.631704+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/services/notify.ts

## Purpose
A domain-event listener that emails the owner of an example when it is published. `module.ts` attaches it through `subscribe`; the service that emitted the event never knows it exists. It is also a template for event listeners: the header says to delete it, along with `src/modules/example/emails.ts`, the module's `templates/` and the `subscribe` line, if nothing reacts to the module's events.

## Key elements
- `mailOwnerOfPublished(payload: { userId: string; title: string }): Promise<void>` is the only export. It handles the `example.published` event.
  - It loads the owner with `userService.getById`.
  - It does nothing if the owner no longer exists or fails `isAuthenticatable`. A locked account (banned, or in the grace period of its own deletion) gets no optional notice.
  - Otherwise it builds the message with `examplePublishedEmail(locale, username, title)`. The locale is `owner.locale`, falling back to `getDefaultLocale()`.
  - It then calls `enqueueEmail({ to: owner.email, subject }, template, data)`.

## Relationships
- `src/infrastructure/adapters/mailer.ts`: provides `enqueueEmail`, which queues the message.
- `src/infrastructure/i18n/index.ts`: provides `getDefaultLocale` for owners with no locale set.
- `src/modules/example/emails.ts`: provides `examplePublishedEmail`, which returns the `subject`, `template` and `data` for the mail.
- `src/modules/users/index.ts`: provides `userService` and the `isAuthenticatable` guard, used to look up the owner and check the account is not locked.
- `src/modules/example/module.ts`: subscribes this handler to the event.

## Notes
- A missing owner is treated as "nobody to tell", not as an error.
- A rejection is logged by the event bus and never reaches the request that published.
- The event goes through the outbox, and a retry re-runs every handler, so the owner may receive the mail more than once.
