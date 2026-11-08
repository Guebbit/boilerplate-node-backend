---
source: src/modules/example/services/notify.ts
sha256: b0182e86531e58d0c46dd88d80439fed60a136a729f42b9135088d549bf522aa
generated_at: 2026-11-08T05:53:44.973571+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/notify.ts

## Purpose

Listener for the `example.published` domain event. When the example module publishes an example, this handler emails the owner a confirmation in their preferred locale. It is attached by `module.ts`'s `subscribe` call, so the publishing service is unaware of its existence.

## Key elements

- **`mailOwnerOfPublished(payload)`** — Single export. Resolves the owner via `userService.getById`, guards against a missing or non-authenticatable account, builds a localized email via `examplePublishedEmail`, and enqueues it through `enqueueEmail`. Returns `Promise<void>`.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Provides `enqueueEmail`, the transport used to deliver the message.
- **`src/infrastructure/i18n/index.ts`** — Provides `getDefaultLocale` as a fallback when the owner has no explicit locale.
- **`src/modules/example/emails.ts`** — Provides `examplePublishedEmail`, the template builder that produces subject, template id, and data for a given locale/username/title.
- **`src/modules/example/module.ts`** — Wires this function into the event bus via its `subscribe` call; the sole registration point.
- **`src/modules/users/index.ts`** — Package entry point from which `userService` and `isAuthenticatable` are imported.
- **`src/modules/users/authenticatable.ts`** — Defines the `isAuthenticatable` predicate used to skip banned or deletion-grace accounts.
- **`src/modules/users/services/index.ts`** — Re-exports `userService` (the `getById` lookup).

## Notes

- **Idempotency is not guaranteed.** The event rides an outbox; a retry re-runs every handler, so the same email can be delivered more than once.
- **Silent no-ops are intentional.** A vanished owner (erased between edit and delivery) or a locked account simply yields no email — not an error, not logged here.
- **Error containment.** Rejections thrown inside this handler are caught by the event bus and logged; they never propagate back to the HTTP request that triggered the publish.
- **Deletion checklist** (from the file header): removing this file is safe only if `../emails.ts`, `../templates/`, and the `subscribe` line in `module.ts` are also removed.
