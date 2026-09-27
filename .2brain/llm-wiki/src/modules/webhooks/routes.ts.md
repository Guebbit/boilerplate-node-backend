---
source: src/modules/webhooks/routes.ts
sha256: c8b1b47a80e811a39f9e8fe326dce53ea88e42cd7c0433a7b5060e1024f9c6a0
generated_at: 2026-09-27T15:43:14.857633+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/routes.ts

## Purpose

Express router for the `/webhooks` admin surface. Wires subscription CRUD, delivery log inspection/replay, and the public event catalogue to their respective controllers, gated behind `webhooks.*` permission keys. Exists so that machine consumers (holding `sk_…` API keys) can manage their webhook subscriptions without a human session.

## Key elements

- **`router`** (exported) — The Express `Router` instance. The sole export of this module.
- **`getAuth` → `isAuthOrCredential`** (applied via `router.use`) — Auth chain for every route. Deliberately uses `isAuthOrCredential` rather than `isAuth` so that API-key (`sk_…`) callers can reach this surface.
- **Subscription routes** — `GET/POST /subscriptions`, `PUT/PATCH/DELETE /subscriptions/:id`, `POST /subscriptions/:id/rotate-secret`, `DELETE /subscriptions/:id/secrets/:secretId`. Each delegates to a dedicated controller and is guarded by a `webhooks.any.{read|create|update|delete}` permission.
- **Delivery routes** — `GET /deliveries` and `POST /deliveries/:id/replay` for the delivery log and manual re-dispatch.
- **Event catalogue** — `GET /events` exposes the list of subscribable event types (read-only).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — Imports `getAuth`, `isAuthOrCredential`, and `requirePermission`; these are applied to every route here.
- **`src/modules/webhooks/controllers/*`** — Each imported function (`listWebhookSubscriptions`, `createWebhookSubscription`, `replaceWebhookSubscription`, `updateWebhookSubscription`, `rotateWebhookSubscriptionSecret`, `removeWebhookSubscriptionSecret`, `deleteWebhookSubscription`, `listWebhookDeliveries`, `replayWebhookDelivery`, `listWebhookEvents`) is the terminal handler for its route.
- **`src/modules/webhooks/module.ts`** — Mounts this `router` under the `/webhooks` prefix (or equivalent) when the webhooks module is registered.
- **`tests/support/routed-modules.ts`** — Consumes this router in integration/test harnesses that exercise the full routing chain.

## Notes

- **`isAuthOrCredential` vs. `isAuth`** is intentional: this is the one webhooks surface where a raw `sk_…` key is a valid credential. Do not "simplify" it to `isAuth`.
- **`PUT` vs. `PATCH` on `/subscriptions/:id`** — `PUT` maps to `replaceWebhookSubscription` (full replacement), `PATCH` maps to `updateWebhookSubscription` (partial update). Both share the same `webhooks.any.update` permission.
- **No public routes.** Unlike the `feedback` module's `/contact`, every route here requires authentication and a permission grant.
- **Permission granularity** — Read/create/update/delete map to distinct permission keys, but rotate-secret, remove-secret, and replay-delivery all reuse `webhooks.any.update`. There is no finer-grained key for those actions.
