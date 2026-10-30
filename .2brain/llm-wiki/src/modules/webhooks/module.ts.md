---
source: src/modules/webhooks/module.ts
sha256: 4233cfc60aaf4ddea227aac444e6cf2aa553462e49b4105ac8761c5d66e3aca7
generated_at: 2026-10-29T06:27:51.397896+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/module.ts

## Purpose

Module manifest for the **outbound webhooks** feature: subscription management, delivery log, and the admin API surface. It reacts to every domain event that a registered module declares in its `publicEvents` entry (resolved via `kernel/registry`) through the domain-event bus, and it owns the queue consumer that performs actual deliveries. The file exists so that deleting the webhooks module removes its consumer, routes, config, and event subscriptions in one place—nothing in `app/` references the channel directly.

## Key elements

- **`onRegistered(modules)`** (private) — lifecycle hook that runs after all modules are registered. Calls `webhooksService.subscribeToWebhookEvents(resolvePublicEvents(modules))` to wire event subscriptions, registers the webhook catalogue, and logs a warning if no message broker is configured (deliveries then rely on the per-minute retry sweep job).
- **`export default { … } satisfies AppModule`** — the manifest object with:
  - `mounts` — mounts `./routes` router at `/webhooks`.
  - `jobs` — registers cron/retry jobs from `./jobs`.
  - `consumers` — declares a single consumer on `WORKER_CHANNELS.WEBHOOK_DELIVER` with `prefetch: 5`, schema-validated payload (`WebhookDeliverJobPayloadSchema`), and handler `webhooksService.processDeliveryJob`.
  - `config` — slices in `webhooksConfig` (secret-ring key, retention, demo-sink gate).
  - `reencrypt` — `webhooksService.reencryptWebhookSecrets` for at-rest re-encryption of signing-secret rings.
  - `personalData` — a `webhookOwnership` section whose `collect` returns `undefined` (nothing appears in account exports) and whose `erase` calls `webhooksService.forgetOwner`.

## Relationships

- **`kernel/registry.ts`** — imports `resolvePublicEvents` and the `AppModule` type; the `onRegistered` hook is invoked by the registry after all modules are known.
- **`infrastructure/adapters/queue.ts`** — imports `isQueueEnabled` for the no-broker warning; the queue adapter's `handleDelivery` performs the schema check referenced in the consumer's comment.
- **`infrastructure/adapters/logger.ts`** — imports `logger` for the `onRegistered` warning.
- **`types/index.ts`** — imports `WORKER_CHANNELS.WEBHOOK_DELIVER` and `WebhookDeliverJobPayloadSchema`.
- **`./routes`**, **`./services`**, **`./config`**, **`./jobs`** — imported and wired into the manifest (mount, service methods, config slice, job list).
- **`modules.ts`** — the top-level module registry that loads this manifest.
- **`modules/users/openapi.yaml`** — contextual: the `ownerUserId` pointer on a subscription references a user-account record owned by the `users` module; this module stores only the pointer, never a copy.
- **`tests/unit/module.test.ts`** — unit-tests the manifest structure and lifecycle.
- **`tests/integration/reencrypt.test.ts`** — integration-tests the `reencrypt` hook.
- **`tests/cross-cutting/webhook-event-producers.test.ts`** — verifies that other modules' `publicEvents` declarations are correctly consumed through this module's subscription path.

## Notes

- `onRegistered` (not `subscribe()`) is used to collect `publicEvents` because the full enabled-module list only exists after registration completes; the same pattern applies to `locales`' translatables lookup.
- The consumer has no separate guard before `processDeliveryJob`—the `schema` field in the consumer definition already rejects malformed payloads at the queue layer, so a redundant check would be dead weight.
- `prefetch: 5` is deliberate: deliveries are I/O-bound signed POSTs, and a dead endpoint's timeout must not serialize a burst of jobs.
- `personalData.collect` intentionally returns `undefined` so the section never appears in a `POST /account/export` response; only `erase` (forgetting the owner pointer) is meaningful.
- The `asyncapi.yaml` / `asyncapi.internal.yaml` files in this directory are the public and internal event schemas that producers and consumers of this module's channel should conform to.
