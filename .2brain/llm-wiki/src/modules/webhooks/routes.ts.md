---
source: src/modules/webhooks/routes.ts
sha256: ceecb9ba960ec3b1f14b4b084fbbca53ced36e8d7f4598fdbd515eab3a44d82a
generated_at: 2026-10-29T06:28:45.584276+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/routes.ts

## Purpose

Defines all HTTP routes for the `/webhooks` admin surface: subscription CRUD, enable/disable, signing-secret rotation, the delivery log (inspect + replay), and the event catalogue. This is the sole routing layer for the webhooks module — it wires URLs to controller handlers and attaches the auth/permission middleware chain.

## Key elements

- **`router`** (exported `Router`) — the single Express router mounted at `/webhooks` by the module.
- **Auth chain** — `router.use(getAuth, isAuthOrCredential)` applied globally to every route below it; per-route `requirePermission('<verb>', 'WebhookSubscription')` gates individual endpoints.
- **Subscription routes** — `GET/POST /subscriptions`, `GET/PUT/PATCH/DELETE /subscriptions/:id`, plus `POST …/enable`, `POST …/disable`, `POST …/secrets`, `DELETE …/secrets/:secretId`.
- **Delivery routes** — `GET /deliveries`, `GET /deliveries/:id`, `POST /deliveries/:id/replay`.
- **Event catalogue** — `GET /events` (list of event types a subscription can filter on).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuthOrCredential`, and `requirePermission`, all consumed here.
- **`src/modules/webhooks/controllers/*`** — every controller function (`listWebhookSubscriptions`, `createWebhookSubscription`, `replaceWebhookSubscription`, `updateWebhookSubscription`, `createWebhookSubscriptionSecret`, `removeWebhookSubscriptionSecret`, `deleteWebhookSubscription`, `getWebhookSubscription`, `enableWebhookSubscription`, `disableWebhookSubscription`, `listWebhookDeliveries`, `getWebhookDelivery`, `replayWebhookDelivery`, `listWebhookEvents`) is imported and registered as a route handler.
- **`src/modules/webhooks/module.ts`** — the module entry point that mounts this `router` into the application.

## Notes

- `isAuthOrCredential` is used deliberately (not `isAuth`) so that `sk_…` API keys can manage subscriptions; this module is designed for machine consumers.
- `PUT /subscriptions/:id` performs a **full replace**; `PATCH` performs a **partial update** of the fields payload. Both map to the `update` permission.
- Adding a secret (`POST …/secrets`) leaves the previous secret active; deleting one (`DELETE …/secrets/:secretId`) is the final step of a rotation.
- Despite the docstring calling `GET /events` "public," it is still behind `requirePermission('read', 'WebhookSubscription')` — there is no truly unauthenticated route in this file.
- No public (unauthenticated) routes exist here, in contrast to `tickets`'s `/contact` endpoint.
