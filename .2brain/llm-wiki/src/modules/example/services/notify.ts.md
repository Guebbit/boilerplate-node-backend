---
source: src/modules/example/services/notify.ts
sha256: 39e7228d040d1919eef67ec6203cab405a378ae641be7868ca37d70a0f47294b
generated_at: 2026-10-14T15:45:37.311975+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/notify.ts

## Purpose

Optional event-bus listener that emails the owner of a newly published example, localized to the owner's language. It exists as a standalone capability that can be removed entirely (along with `emails.ts`, `templates/`, and the `subscribe` line in `module.ts`) without affecting the publish flow.

## Key elements

- **`mailOwnerOfPublished(payload)`** — The single export. Receives an `example.published` event (`{ userId, title }`), looks up the owner via `userService.getById`, resolves their locale (falling back to `getDefaultLocale()`), builds the email through `examplePublishedEmail`, and enqueues it with `enqueueEmail`. Returns early (no error) if the owner no longer exists.

## Relationships

- **`src/modules/example/module.ts`** — Calls `mailOwnerOfPublished` as a handler registered on the `example.published` domain event via its `subscribe` mechanism. The service is unaware of this attachment.
- **`src/modules/example/emails.ts`** — Supplies `examplePublishedEmail`, which produces the localized subject, template, and data for the notification.
- **`src/infrastructure/adapters/mailer.ts`** — Provides `enqueueEmail`, the actual delivery mechanism.
- **`src/infrastructure/i18n/index.ts`** — Provides `getDefaultLocale()` for the locale fallback.
- **`src/modules/users/index.ts`** (→ `services/index.ts`) — Provides `userService.getById` to resolve the owner record.

## Notes

- **Non-idempotent by design.** The event rides an outbox; a retry re-runs every handler, so the owner *can* receive duplicate emails. There is no deduplication logic in this file.
- **Silent no-op on missing owner.** A deleted owner between edit and delivery is treated as "nobody to tell," not an error. Do not add logging here expecting it to surface in the publish response — rejections are caught and logged by the event bus only.
- **Removal recipe.** To drop the feature: delete this file, `../emails.ts`, `../templates/`, and the `subscribe` line in `module.ts`. No other code depends on `mailOwnerOfPublished`.
