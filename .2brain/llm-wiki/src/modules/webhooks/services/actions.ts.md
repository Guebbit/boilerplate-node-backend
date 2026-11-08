---
source: src/modules/webhooks/services/actions.ts
sha256: 40844b13e9445ca2ce05bed9853d1d2d59f3c73e1f4c3ea590d89bade1941111
generated_at: 2026-11-08T09:05:30.661973+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/actions.ts

## Purpose

Centralizes the ability-to-act rules for webhook subscriptions and deliveries. Given a caller's ability keys and a subscription's minimal state, it computes the exact set of actions the caller may perform. Existing so that every controller and service reads the same single source of truth rather than re-deriving permission logic independently.

## Key elements

- **`Standing`** (interface) — The two boolean flags a caller holds: `update` (`update:WebhookSubscription`) and `delete` (`delete:WebhookSubscription`).
- **`standingOn(caller)`** — Resolves a `TenantCaller` into a `Standing` via the kernel's `holds` check.
- **`SubscriptionState`** (interface) — The minimal record facts a rule reads: `enabled` and `secretCount`.
- **`subscriptionActions(state, standing)`** — Returns the full `WebhookSubscriptionActions` object (`update`, `delete`, `enable`, `disable`, `createSecret`, `deleteSecret`) computed from state + standing.
- **`withSubscriptionActions(row, standing)`** — Spreads a `StoredWebhookSubscription` wire row and appends its `actions` field. Used in list responses where the lean row already carries `enabled` and `secretIds`.
- **`viewSubscription(subscription, caller)`** — Transforms a full `WebhookSubscriptionDocument` into the wire `WebhookSubscription` shape (via `presentWebhookSubscription`), injecting caller-specific `actions`. Used in detail responses.
- **`deliveryActions(subscriptionEnabled, standing)`** — Returns `WebhookDeliveryActions`; the sole action `replay` requires both `update` standing and a live subscription.

## Relationships

- **`src/kernel/ability.ts`** — Imports `holds` to check whether the caller possesses a given ability key.
- **`src/types/index.ts`** — Imports the shared type aliases `TenantCaller`, `WebhookSubscription`, `WebhookSubscriptionActions`, `WebhookDeliveryActions`.
- **`src/modules/webhooks/repository.ts`** — Imports `StoredWebhookSubscription` (the lean list row type).
- **`src/modules/webhooks/model.ts`** — Imports `WebhookSubscriptionDocument` (the full detail document type).
- **`src/modules/webhooks/presenters.ts`** — Imports `presentWebhookSubscription` to shape the detail wire response.
- **`src/modules/webhooks/secrets.ts`** — Imports `liveRingEntries` to count active signing secrets in the detail path.
- **Controllers** (`post-subscription`, `update-subscription`, `post-subscription-enable`, `post-subscription-disable`, `post-subscription-secret`, `delete-subscription-secret`) and **`services/deliveries.ts`** / **`services/subscriptions.ts`** — Consume the exported action functions to gate their endpoint logic.

## Notes

- **Two state-derivation paths.** In list context `enabled` comes from `row.enabled` (boolean) and `secretCount` from `row.secretIds.length`. In detail context `enabled` is `!subscription.disabledAt` (timestamp absence) and `secretCount` is `liveRingEntries(subscription.secrets).length`. Both feed the same `subscriptionActions` function, so the rule logic stays identical.
- **`deleteSecret` guard.** The ring is never allowed to go empty (deleting the last secret returns 422 upstream), so the flag requires `secretCount > 1`.
- **`Standing` is computed once per request** and threaded into every per-row call, avoiding repeated `holds` lookups when rendering a list.
