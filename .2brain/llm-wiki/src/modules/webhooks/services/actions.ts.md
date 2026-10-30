---
source: src/modules/webhooks/services/actions.ts
sha256: a4332fcd4bfbfbb8063c5f786b815e8f917219e483c6ecd1035baec30f9f82c9
generated_at: 2026-10-29T06:29:24.402296+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/actions.ts

## Purpose

Centralises the rule for "what may this caller do to a webhook subscription or delivery?" so that no controller or client re-derives permission logic independently. Each action flag is the conjunction of an ability key the caller holds and a small piece of subscription state (enabled/disabled, secret count), keeping the check O(1) against data already in hand.

## Key elements

- **`Standing` (interface)** — the two booleans (`update`, `delete`) a caller holds on the `WebhookSubscription` resource type.
- **`standingOn(caller)`** — resolves a `TenantCaller`'s ability keys into a `Standing` via `holds`.
- **`SubscriptionState` (interface)** — the only two facts the flags read off the record: `enabled` and `secretCount`.
- **`subscriptionActions(state, standing)`** — returns `WebhookSubscriptionActions` (update, delete, enable, disable, createSecret, removeSecret). `enable`/`disable` are mutually exclusive and both gated on `update`. `removeSecret` additionally requires `secretCount > 1`.
- **`withSubscriptionActions(row, standing)`** — enriches a lean `StoredWebhookSubscription` list-row with its `actions` field; uses `row.secretIds.length` as the secret count.
- **`viewSubscription(document, caller)`** — produces the full wire response for a single subscription: delegates presentation to `presentWebhookSubscription` and supplies actions computed from the document's `disabledAt` / `secrets` ring.
- **`deliveryActions(subscriptionEnabled, standing)`** — returns `WebhookDeliveryActions`; `replay` requires `update` *and* the parent subscription to still exist and be enabled.

## Relationships

- **`src/kernel/ability.ts`** — `holds` is the sole predicate used to check whether the caller possesses a given ability key.
- **`src/types/index.ts`** — source of `TenantCaller`, `WebhookSubscription`, `WebhookSubscriptionActions`, `WebhookDeliveryActions`.
- **`src/modules/webhooks/repository.ts`** — supplies the `StoredWebhookSubscription` shape consumed by `withSubscriptionActions`.
- **`src/modules/webhooks/model.ts`** — supplies `WebhookSubscriptionDocument` consumed by `viewSubscription`.
- **`src/modules/webhooks/presenters.ts`** — `presentWebhookSubscription` is called by `viewSubscription` to serialise the document before attaching `actions`.
- **`src/modules/webhooks/secrets.ts`** — `liveRingEntries` is used to count active secrets from a document.
- **`src/modules/webhooks/services/subscriptions.ts`** and **`src/modules/webhooks/services/deliveries.ts`** — the service layer that consumes `standingOn`, `subscriptionActions`, `withSubscriptionActions`, `viewSubscription`, and `deliveryActions` for authorization and response shaping.
- **Webhook controllers** (`create-subscription`, `enable-subscription`, `disable-subscription`, `update-subscription`, `create-subscription-secret`, `remove-subscription-secret`) — indirect consumers via the services above; they trigger the ability checks that this file defines.

## Notes

- Two entry paths exist intentionally: **list views** call `withSubscriptionActions` on a lean row (no document load needed), while **detail views** call `viewSubscription` on the full document. Both produce the same `WebhookSubscription` wire shape.
- `removeSecret` requires `secretCount > 1` because the ring invariant forbids emptying it; a `removeSecret` on the last secret is expected to 422 downstream.
- `enable` and `disable` are both gated on `standing.update` but differ only by the `state.enabled` polarity — a caller who lacks `update` can neither flip the flag in either direction.
- The file exports no side effects or I/O; it is a pure decision layer that can be unit-tested without a database or network.
