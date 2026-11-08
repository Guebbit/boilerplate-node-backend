---
source: src/modules/webhooks/routes.ts
sha256: d8502c98f450a779e96a794313007c25bb687b22eb9b818fe7b6cf2bc28067eb
generated_at: 2026-11-08T09:04:44.679167+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/routes.ts

## Purpose
Defines the Express router for the `/webhooks` admin surface. It wires every subscription CRUD action, the delivery log, delivery replay, and the public event catalogue to their respective controller handlers, each gated behind a fine-grained `requirePermission` check.

## Key elements
- **`router`** — The sole export. An Express `Router` instance with all `/webhooks/*` routes attached.
- **Route groups:**
  - *Subscriptions* — list, create, get, replace (PUT), patch, delete, enable, disable, add/remove secrets.
  - *Deliveries* — list log, get one delivery, replay a delivery.
  - *Events* — list the event catalogue available for subscription filters.
- **Auth chain (module-level `router.use`)** — `getAuth` followed by `isAuthOrCredential`, meaning both session tokens and `sk_…` API keys are accepted.

## Relationships
- **`src/kernel/middlewares/authorizations.ts`** — Provides `getAuth`, `isAuthOrCredential`, and `requirePermission`; applied to every route in this file.
- **`src/modules/webhooks/module.ts`** — Registers `router` with the Express app under the `/webhooks` prefix.
- **Controllers (13 files under `src/modules/webhooks/controllers/`)** — Each imported function is the terminal handler for one route:
  - `listWebhookSubscriptions`, `createWebhookSubscription`, `getWebhookSubscription`, `replaceWebhookSubscription`, `updateWebhookSubscription`, `deleteWebhookSubscription`
  - `enableWebhookSubscription`, `disableWebhookSubscription`
  - `createWebhookSubscriptionSecret`, `deleteWebhookSubscriptionSecret`
  - `listWebhookDeliveries`, `getWebhookDelivery`, `replayWebhookDelivery`
  - `listWebhookEvents`

## Notes
- **Auth choice is deliberate:** the comment explicitly calls out `isAuthOrCredential` (not `isAuth`) so that machine consumers using `sk_…` keys can manage their own subscriptions.
- **Permission model is uniform:** every route maps to one of four verbs (`read`, `create`, `update`, `delete`) on the `WebhookSubscription` resource. Secret rotation and delivery replay are treated as `update`, not as their own resource.
- **No public/open routes exist here.** The module doc-block contrasts this with the `tasks` module's `/contact`, which does expose a public endpoint.
- **PUT vs PATCH on subscriptions:** PUT (`replaceWebhookSubscription`) replaces the entire subscription; PATCH (`updateWebhookSubscription`) changes only the sent-fields. Both require `update` permission.
