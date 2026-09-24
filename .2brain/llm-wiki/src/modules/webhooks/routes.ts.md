---
source: src/modules/webhooks/routes.ts
sha256: adc77daf41ca314eadffcd856a3ce0be2820cd5a6206ccb1da89ff2df39af939
generated_at: 2026-09-23T19:41:28.412317+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/routes.ts

## Purpose

Defines the Express router for the `/webhooks` admin surface: subscription CRUD, delivery log inspection, delivery replay, and the public event catalogue. Every route is protected by a `webhooks.*` permission key; there are no unauthenticated routes in this module.

## Key elements

- **`router`** (exported) — the sole export; an Express `Router` instance with the following routes:
  - `GET /subscriptions` → `listWebhookSubscriptions` (`webhooks.any.read`)
  - `POST /subscriptions` → `createWebhookSubscription` (`webhooks.any.create`)
  - `PATCH /subscriptions/:id` → `updateWebhookSubscription` (`webhooks.any.update`)
  - `DELETE /subscriptions/:id` → `deleteWebhookSubscription` (`webhooks.any.delete`)
  - `GET /deliveries` → `listWebhookDeliveries` (`webhooks.any.read`)
  - `POST /deliveries/:id/replay` → `replayWebhookDelivery` (`webhooks.any.update`)
  - `GET /events` → `listWebhookEvents` (`webhooks.any.read`)

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuthOrCredential`, and `requirePermission`, applied as middleware on every route.
- **Controllers (`list-subscriptions`, `create-subscription`, `update-subscription`, `delete-subscription`, `list-deliveries`, `replay-delivery`, `list-events`)** — each exports the handler function bound to one route above.
- **`src/modules/webhooks/module.ts`** — the module entry point that mounts this router.
- **`tests/support/routed-modules.ts`** — test harness that registers this router for integration tests.

## Notes

- Auth middleware is `isAuthOrCredential`, **not** `isAuth`. This intentionally allows `sk_…` API keys to reach the module so machine consumers can manage their own subscriptions. Do not "fix" this to `isAuth`.
- `POST /deliveries/:id/replay` is gated by `webhooks.any.update` (not a dedicated `replay` key), consistent with the module's convention that mutating actions map to `update`.
- No route here is public; contrast with the `feedback` module's `/contact` endpoint.
