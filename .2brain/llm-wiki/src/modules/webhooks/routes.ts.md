---
source: src/modules/webhooks/routes.ts
sha256: ebce0c35562468c3656f9bd38153fcd8972dfb18a9b922c8326955de474f501a
generated_at: 2026-10-15T12:20:18.269670+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/routes.ts

## Purpose

Defines the Express router for the `/webhooks` admin surface. It wires every webhook route—subscription CRUD, secret rotation/removal, delivery log, replay, and the public event catalogue—behind a two-layer authorization gate (auth + fine-grained permission) and delegates handling to dedicated controller modules.

## Key elements

- **`router`** (exported) — the Express `Router` instance mounted under `/webhooks`.
- **Auth chain** — `router.use(getAuth, isAuthOrCredential)` applies globally; allows both session tokens and `sk_…` API keys.
- **Subscription routes** — `GET/POST /subscriptions`, `PUT /subscriptions/:id` (full replace), `PATCH /subscriptions/:id` (partial update), `DELETE /subscriptions/:id`.
- **Secret management routes** — `POST /subscriptions/:id/rotate-secret` (add a new ring secret), `DELETE /subscriptions/:id/secrets/:secretId` (drop one).
- **Delivery routes** — `GET /deliveries` (log, newest first), `POST /deliveries/:id/replay` (re-send).
- **Event catalogue** — `GET /events` (list of events a subscription may filter on).
- Every route is guarded by `requirePermission('webhooks.any.<action>')` where action ∈ {read, create, update, delete}.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuthOrCredential`, and `requirePermission`, the three functions used for the auth and permission gate.
- **`src/modules/webhooks/controllers/*`** — each controller file exports the single handler function bound to one route (e.g. `listWebhookSubscriptions`, `createWebhookSubscription`, `replaceWebhookSubscription`, `updateWebhookSubscription`, `deleteWebhookSubscription`, `rotateWebhookSubscriptionSecret`, `removeWebhookSubscriptionSecret`, `listWebhookDeliveries`, `replayWebhookDelivery`, `listWebhookEvents`).
- **`src/modules/webhooks/module.ts`** — the module entry point that imports and mounts this `router` into the application.

## Notes

- **`isAuthOrCredential`, not `isAuth`** — the middleware deliberately accepts `sk_…` API keys so machine consumers can manage their own subscriptions without a session token.
- **PUT vs. PATCH are distinct handlers** — `replaceWebhookSubscription` (full replace) and `updateWebhookSubscription` (partial field update) are separate functions in `update-subscription.ts`; they are not aliases.
- **No public/anonymous routes** — every endpoint requires a `webhooks.any.*` permission, unlike the `feedback` module which exposes a public `/contact` route.
- **Secret rotation is two-step** — rotating adds a new ring secret (old one stays active); removing a secret by ID completes the rotation. Both map to the `update` permission.
