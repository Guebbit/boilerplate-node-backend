---
source: src/modules/webhooks/module.ts
sha256: 92342c9a5fc3797ca914ba4d8ca53966282faf9ef6f3235450dd9aa43c63f2f5
generated_at: 2026-11-08T09:03:49.812684+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/module.ts

## Purpose

Module manifest for the **outbound webhooks** feature: subscription management, the delivery log, and the admin API. It subscribes to every `publicEvents` entry declared by other modules via the domain-event bus (a reverse edge — this module never imports `orders`/`payments`), and it declares its own queue consumer for webhook delivery so that removing this module is sufficient to stop the queue from mattering.

## Key elements

- **`onRegistered(modules)`** — Called after all enabled modules are registered. Calls `webhooksService.subscribeToWebhookEvents(resolvePublicEvents(modules))` to wire up event subscriptions, registers the webhook catalog (module names), and logs a warning if no message broker is configured (delivery then falls back to a per-minute retry sweep job).
- **`export default { … } satisfies AppModule`** — The manifest object with:
  - `name: 'webhooks'`
  - `mounts` — mounts `./routes` at `/webhooks`.
  - `jobs` — exposes `webhooksJobs` from `./jobs`.
  - `consumers` — a single queue consumer on `WORKER_CHANNELS.WEBHOOK_DELIVER` with `prefetch: 5`, `schema: WebhookDeliverJobPayloadSchema`, and `handler: webhooksService.processDeliveryJob`.
  - `config` — `webhooksConfig.slice` (secret-ring key, retention, demo-sink gate).
  - `reencrypt` — `webhooksService.reencryptWebhookSecrets` for rotating encrypted signing-secret rings at rest.
  - `personalData` — one section (`webhookOwnership`); `collect` always resolves `undefined` (owner is a pointer, not a copy), `erase` calls `webhooksService.forgetOwner`.

## Relationships

- **`src/kernel/registry.ts`** — Imports `resolvePublicEvents` and the `AppModule` type; the manifest is registered into the kernel's module registry.
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger`; emits a warning in `onRegistered` when the queue is unavailable.
- **`src/infrastructure/adapters/queue.ts`** — Imports `isQueueEnabled` for the broker check; the `schema` field on the consumer is validated by the queue's `handleDelivery` before the handler is invoked.
- **`src/types/index.ts`** — Imports `WORKER_CHANNELS.WEBHOOK_DELIVER` and `WebhookDeliverJobPayloadSchema`.
- **`src/modules/webhooks/routes.ts`** — Imports `router` and mounts it under `/webhooks`.
- **`src/modules/webhooks/services/index.ts`** — Imports `webhooksService`; delegates event subscription, catalog registration, delivery processing, secret re-encryption, and owner-erasure to it.
- **`src/modules/webhooks/config.ts`** — Imports `webhooksConfig` and exposes its `slice` in the manifest.
- **`src/modules/webhooks/jobs.ts`** — Imports `webhooksJobs` and attaches it to the manifest.
- **`src/modules.ts`** — Registers this module (alongside others) into the application's module set.

## Notes

- **`onRegistered` timing is intentional.** `subscribe()` runs before all modules are known, so the registry lookup (`resolvePublicEvents`) must happen in `onRegistered`. The same pattern is used for `locales`' translatables.
- **No redundant guard in front of the delivery handler.** The consumer's `schema` already rejects malformed payloads before `processDeliveryJob` is called; adding a second check here would be dead code.
- **`prefetch: 5`** is chosen because each job is a single signed POST (I/O-bound), and a slow endpoint's hard timeout should not serialise a burst of jobs.
- **`personalData.collect` always returns `undefined`.** The `ownerUserId` on a subscription is a pointer to an operator account, not a data copy — so it intentionally appears in no `POST /account/export` response. Only `erase` does work (forgets the pointer).
