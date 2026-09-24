---
source: src/modules/webhooks/module.ts
sha256: 1bf102657c1e5b69fd71bc144b83dd06253147a6a9a61bfe6d4bc28d93540c29
generated_at: 2026-09-23T19:40:47.954823+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/module.ts

## Purpose

Module manifest for the outbound-webhooks feature. It registers the module's HTTP routes, permission keys, domain-event subscriptions, queue consumer, and required/forbidden config into the kernel registry (`AppModule`). By owning its queue consumer declaration here (rather than in `app/workers.ts`), deleting this file is sufficient to make the delivery queue inert.

## Key elements

- **`export default`** — the `AppModule` object satisfying the kernel contract. Carries all registration metadata in one place.
- **`subscribe`** — delegates to `subscribeToWebhookEvents` (from `./services`); wires the module to `order.created`, `order.status_changed` (filtered to `paid`/`shipped`), `order.cancelled`, `payment.succeeded`, and `payment.failed` on the domain-event bus.
- **`consumers[0]`** — declares a consumer on `WORKER_CHANNELS.WEBHOOK_DELIVER` with handler `processDeliveryJob`, payload validated by `WebhookDeliverJobPayloadSchema`, `prefetch: 5`.
- **`permissions`** — four keys (`webhooks.any.{read,create,update,delete}`); the cross-cutting test `module-permissions.test.ts` fails if a key outlives the module.
- **`requiredConfig`** — `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` (min 16 chars); encrypts each subscription's signing secret.
- **`forbiddenInProduction`** — `NODE_WEBHOOK_DEMO_SINK_URL` must be absent when `NODE_ENV=production`.
- **`personalData: 'none'`** — `ownerUserId` is a pointer to an operator; no personal data is duplicated or stored here.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type this file satisfies; the registry consumes the default export to boot the module.
- **`src/types/index.ts`** — source of `WORKER_CHANNELS` and `WebhookDeliverJobPayloadSchema` used in the consumer declaration.
- **`src/modules/webhooks/routes.ts`** — supplies the `router` mounted at `basePath: '/webhooks'`.
- **`src/modules/webhooks/services/index.ts`** — exports `subscribeToWebhookEvents` and `processDeliveryJob`, the two functions this manifest delegates to.
- **`src/modules/webhooks/services/publish.ts` / `attempt.ts`** — implementation details behind `subscribeToWebhookEvents` and `processDeliveryJob` respectively.
- **`orders/events.ts` / `payments/events.ts`** — upstream producers of the domain events consumed via `subscribeToWebhookEvents`; they never import this module (one-directional dependency).
- **`src/modules/webhooks/asyncapi.yaml` / `asyncapi.internal.yaml`** — API contracts for the webhook payload schemas and the internal delivery channel referenced by the consumer.
- **`src/modules/webhooks/tests/unit/module.test.ts`** — unit tests for the manifest shape and registration logic.
- **`tests/cross-cutting/webhook-event-producers.test.ts`** — verifies the event producers (orders, payments) emit payloads matching this module's subscription expectations.

## Notes

- **No guard before the queue handler.** The `schema` field on the consumer already rejects malformed jobs inside `infrastructure/adapters/queue.ts` (`handleDelivery`) before `processDeliveryJob` is invoked; a redundant check in this file would be dead code.
- **`prefetch: 5`** is deliberate: delivery is a single signed POST (I/O-bound), and a dead endpoint's hard timeout (`transport/webhook-delivery.ts`) must not let a burst serialize into unbounded delay.
- **`forbiddenInProduction` is a second gate.** Beyond the generic check in `kernel/required-config.ts`, `config.ts`'s `getWebhookDemoAllowedHost` provides a narrower, feature-specific rejection.
- **Locales path** uses `path.join(__dirname, 'locales')` — the directory must exist at build time or i18n lookups will silently miss.
