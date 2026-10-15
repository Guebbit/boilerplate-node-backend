---
source: src/modules/webhooks/module.ts
sha256: 09ec30c2be8e4c6bf31bdc93b6ac31ee9d23e677eabe5d09a2e6d697a6bc43d7
generated_at: 2026-10-15T12:19:20.085596+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/module.ts

## Purpose

Module manifest for the outbound webhooks module. It declares the module's identity (name, routes, locales), registers its queue consumer for webhook delivery, wires its services (event subscription, catalogue, re-encryption) into the kernel registry lifecycle, and configures the secret-ring / retention settings. It exists so that removing this single file fully detaches the webhook queue consumer and event subscriptions without leaving dangling references in `app/`.

## Key elements

- **`onRegistered(modules)`** – Lifecycle callback invoked by the kernel registry *after* all modules are known. Resolves every module's `publicEvents` declarations via `resolvePublicEvents`, calls `subscribeToWebhookEvents` and `registerWebhookCatalogue`, and logs a warning if no message broker is configured (deliveries then rely on the per-minute retry sweep).
- **Default export (`AppModule`)** – The module manifest object: `name`, `basePath: '/webhooks'`, `routes` (from `./routes`), `locales`, `templates`, `onRegistered`, `consumers`, `config`, `reencrypt`, `personalData: 'none'`.
- **`consumers[0]`** – Declares the `WORKER_CHANNELS.WEBHOOK_DELIVER` queue consumer with `handler: processDeliveryJob`, `schema: WebhookDeliverJobPayloadSchema`, and `prefetch: 5`.

## Relationships

- **`@kernel/registry`** – Provides the `AppModule` type (satisfied by the default export), `resolvePublicEvents` (called in `onRegistered`), and the registry machinery that invokes `onRegistered` and dispatches queue consumers.
- **`@infrastructure/adapters/logger`** – Imported for the no-broker warning in `onRegistered`.
- **`@infrastructure/adapters/queue`** – `isQueueEnabled` gates the warning; the adapter's `handleDelivery` performs schema validation before invoking `processDeliveryJob`.
- **`./services`** – Source of `subscribeToWebhookEvents`, `processDeliveryJob`, `registerWebhookCatalogue`, and `reencryptWebhookSecrets`.
- **`./routes`** – Provides the `router` for the admin HTTP surface under `/webhooks`.
- **`./config`** – Supplies `webhooksConfig` (secret-ring key, retention, demo-sink gate) via the `config: [webhooksConfig.slice]` entry.
- **`src/modules/users/openapi.yaml`** – Context for the `ownerUserId` field on subscriptions (points at an operator, not a data-subject export).
- **`asyncapi.yaml` / `asyncapi.internal.yaml`** – Event-contract specs for the public and internal webhook events this module reacts to.

## Notes

- **Timing of `onRegistered` is load-bearing.** `resolvePublicEvents` needs the *full* module list, which only exists by the `onRegistered` phase. Running it at `subscribe()` time would miss late-registered modules. The same pattern applies to the `locales` lookup.
- **No guard before the queue handler.** The queue adapter already rejects jobs missing required fields via the `schema` before calling `processDeliveryJob`; a redundant check here would be dead code.
- **`prefetch: 5` is intentional.** Delivery is a single signed POST (I/O-bound). A dead endpoint's hard timeout must not cause a burst of jobs to queue up serially.
- **`personalData: 'none'` is a deliberate declaration.** `ownerUserId` is a pointer to a `users` record, never a copy; no email or other personal data is stored in this module.
