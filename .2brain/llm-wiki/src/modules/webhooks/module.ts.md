---
source: src/modules/webhooks/module.ts
sha256: 7686753c6b0d1c9889cd47ac3d382e4b8da49477434a845a0d7e3615e1638f1e
generated_at: 2026-09-27T15:42:29.393315+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/module.ts

## Purpose

The module manifest for the webhooks module. It wires the module into the application's domain-event bus, declares its queue consumer, routes, permissions, and runtime-config requirements — all in one `AppModule` object. This is the single file that makes "webhooks" a first-class module: deleting it removes the consumer, the routes, the permissions, and the event subscriptions without any cleanup needed elsewhere.

## Key elements

- **`onRegistered(modules)`** — called by the registry once every enabled module is known. Calls `resolvePublicEvents(modules)` to collect `publicEvents` declarations from other modules' manifests, then passes them to `subscribeToWebhookEvents`. Runs at `onRegistered` (not `subscribe`) because the full module list does not exist yet at subscribe time.
- **`default` export (the `AppModule` object)** — the manifest entry:
  - `name: 'webhooks'`, `basePath: '/webhooks'`, `routes: router` (from `./routes`).
  - `permissions` — four keys (`webhooks.any.{read,create,update,delete}`) owned by this module; `tests/cross-cutting/module-permissions.test.ts` enforces that no orphaned keys survive if the module is deleted.
  - `consumers` — a single `ModuleConsumer` for `WORKER_CHANNELS.WEBHOOK_DELIVER`. Handler is `processDeliveryJob` (from `./services`); the payload is validated by `WebhookDeliverJobPayloadSchema` *before* the handler is invoked, so no extra guard is needed here. `prefetch: 5` keeps a burst of I/O-bound signed POSTs from serialising against a dead endpoint's timeout.
  - `requiredConfig` — mandates `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` (≥ 16 chars); the shipped placeholder would leave every stored subscription secret recoverable.
  - `forbiddenInProduction` — `NODE_WEBHOOK_DEMO_SINK_URL` must be absent when `NODE_ENV=production`.
  - `personalData: 'none'` — `ownerUserId` is a pointer to an operator, not a personal-data copy.
  - `locales` — path to a `locales/` directory alongside this file.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/registry.ts` | Imports `resolvePublicEvents` and the `AppModule` type; the registry invokes `onRegistered` and reads `consumers` from this manifest. |
| `src/types/index.ts` | Imports `WORKER_CHANNELS.WEBHOOK_DELIVER` (queue name) and `WebhookDeliverJobPayloadSchema` (payload validation). |
| `src/modules/webhooks/routes.ts` | Imports `router`, which is exposed as the module's `routes` field. |
| `src/modules/webhooks/services/index.ts` | Barrel re-exports `subscribeToWebhookEvents` and `processDeliveryJob`; the latter is the queue handler, the former wires event-bus subscriptions. |
| `src/modules/webhooks/services/publish.ts` / `attempt.ts` | Indirectly reached through the services barrel; `processDeliveryJob` orchestrates them. |
| `src/modules/webhooks/asyncapi.yaml` / `asyncapi.internal.yaml` | Contract documents for the inbound events this module subscribes to and the outbound delivery messages it publishes. |
| `src/modules.ts` | Registers this module (by name) in the enabled-module list that `onRegistered` receives. |
| `tests/cross-cutting/webhook-event-producers.test.ts` | Verifies that producer modules' `publicEvents` declarations are actually consumed by this module's subscription. |
| `tests/integration/refund-retry-webhooks.test.ts` | Exercises the full delivery path (event → queue → `processDeliveryJob`) for refund/retry scenarios. |
| `src/modules/webhooks/tests/unit/module.test.ts` | Unit-tests the manifest shape and `onRegistered` behaviour. |

## Notes

- **No cross-module imports.** This module discovers other modules' events exclusively through the registry (`resolvePublicEvents`). It never imports `orders`, `payments`, or any other domain module — and none of them import it. The coupling is via the shared event bus and the `publicEvents` manifest field.
- **Consumer is declared here, not in `app/workers.ts`.** Because the queue binding lives inside the module manifest, deleting this file makes `WORKER_CHANNELS.WEBHOOK_DELIVER` a no-op with nothing left to clean up in `app/`.
- **`onRegistered` timing.** The subscription is deferred to the post-registration hook because `resolvePublicEvents` needs the complete module list, which only exists after every module's `subscribe()` has run.
- **`forbiddenInProduction` is a two-layer guard.** The generic check lives in `kernel/required-config.ts`; `config.ts` additionally exposes `getWebhookDemoAllowedHost` as a narrower gate on the same variable.
