---
source: src/modules/notifications/module.ts
sha256: f24fb3ad37c6dea223a2503cf9719c1852ba449eb2c632ff2e7f168f643c2615
generated_at: 2026-11-08T06:32:07.657252+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/module.ts

## Purpose

Module manifest for the notifications inbox. Registers the module's HTTP routes, configuration, domain-event subscriptions, personal-data handlers, and locale/template paths with the kernel registry so the application can mount the module, react to events, and fulfil GDPR collect/erase requests.

## Key elements

- **Default export** — an `AppModule` object tying together every piece the kernel needs to boot the module.
- **`subscribe()`** — wires `notificationsService` handlers to six domain events (task lifecycle events, webhook auto-disable, outbox dead-letter). Called once at startup.
- **`personalData`** — two sections (`notifications`, `staffNotifications`) exposing `collect` (read the user's inbox rows) and `erase` (hard-delete via `notificationsService.removeByUserId`, joining the caller's transaction). Both sections hit the same underlying rows.
- **`mounts`** — attaches `router` at `/notifications`.
- **`config`** — registers `notificationsConfig.slice` for runtime configuration.
- **`locales` / `templates`** — file-system paths the kernel resolves for i18n strings and notification templates.

## Relationships

- **`src/kernel/registry.ts`** — imports the `AppModule` type that shapes the default export.
- **`src/kernel/events.ts`** — imports `onDomainEvent`; every subscription in `subscribe()` goes through it.
- **`src/kernel/outbox.ts`** — imports the `OUTBOX_EVENT_DEAD` constant to react to dead-lettered outbox events.
- **`src/modules/tasks/index.ts`** — imports the four `TASK_*` event-name constants used as subscription keys.
- **`src/modules/webhooks/index.ts`** — imports `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` for the same purpose.
- **`src/modules/notifications/config.ts`** — provides the `notificationsConfig` value registered in the manifest.
- **`src/modules/notifications/routes.ts`** — provides the `router` mounted under `/notifications`.
- **`src/modules/notifications/services/index.ts`** — provides `notificationsService`, the sole handler for every subscribed event and the back-end for the personal-data `collect`/`erase` callbacks.
- **`src/modules.ts`** — imports this module's default export to aggregate all modules at application startup.
- **`tests/integration/erasure.test.ts`** — exercises the `personalData.erase` path end-to-end.

## Notes

- The module is strictly an **inbox**: it is *written* by domain events and never *imports* other modules to send a message. This keeps the dependency graph acyclic—producers stay unaware of the inbox's existence.
- `personalData` declares two sections, but both `collect` functions and the single `erase` operate on the **same rows** (user notifications vs. staff notices are distinguished by an `audience` column, not a separate table). The comment in the source confirms this.
- The `erase` handler receives a `session` parameter and delegates to `notificationsService.removeByUserId(userId, session)` to join the caller's transaction; do not replace it with a standalone delete.
- `asyncapi.yaml` in the same directory is the AsyncAPI spec for the events this module consumes; it is documentation, not imported at runtime.
