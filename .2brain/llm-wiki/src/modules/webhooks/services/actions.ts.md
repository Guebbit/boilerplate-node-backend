---
source: src/modules/webhooks/services/actions.ts
sha256: 363a1d7ad617da22d4478087a02706b60c9448c4259a028ce82dc6e79e5dcb8d
generated_at: 2026-11-14T22:45:11.188088+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/actions.ts

## Purpose

Computes the per-caller permission flags ("actions") that the API returns alongside each webhook subscription and delivery. By centralising the rules here, controllers and services simply read a boolean off the payload instead of re-deriving capability checks at the edge.

## Key elements

- **`Standing` (interface)** — The caller-side half of every rule: `update`, `delete` booleans plus a `reads(eventTypes)` predicate backed by the event catalogue.
- **`standingOn(caller)`** — Resolves a `TenantCaller` into a `Standing` by calling `holds()` for the two ACL keys and wrapping `unreadableEventTypes` into the `reads` closure.
- **`withSubscriptionActions(row, standing)`** — Spreads a lean stored list row and attaches a computed `WebhookSubscriptionActions` object. Used on the list path where no extra data is loaded.
- **`viewSubscription(doc, caller)`** — Builds the full wire shape for a single subscription detail response: calls `presentWebhookSubscription` with actions derived from the document's secrets and event filter.
- **`deliveryActions(subscriptionEnabled, eventType, standing)`** — Returns a `WebhookDeliveryActions` object; `replay` is gated on `update` + subscription still enabled + caller can read that specific event type.

## Relationships

- **`src/kernel/ability.ts`** — Imports `holds`, the single permission-check primitive used to evaluate `update:WebhookSubscription` and `delete:WebhookSubscription`.
- **`src/types/index.ts` / `src/types/auth-context.ts`** — Source of the `TenantCaller`, `WebhookSubscriptionActions`, `WebhookDeliveryActions`, and `WebhookSubscription` type contracts this module implements.
- **`src/modules/webhooks/repository.ts`** — Supplies the `StoredWebhookSubscription` type (the lean list row) that `withSubscriptionActions` annotates.
- **`src/modules/webhooks/model.ts`** — Supplies `WebhookSubscriptionDocument`, the full persisted document consumed by `viewSubscription`.
- **`src/modules/webhooks/presenters.ts`** — Provides `presentWebhookSubscription`, the shape mapper `viewSubscription` delegates to for the non-action fields.
- **`src/modules/webhooks/secrets.ts`** — Provides `liveRingEntries` to count active secrets for the `deleteSecret` / `createSecret` flags.
- **`src/modules/webhooks/services/catalog.ts`** — Provides `unreadableEventTypes`, the catalogue rule that feeds the `reads` predicate.
- **Controllers (`post-subscription.ts`, `post-subscription-enable.ts`, `post-subscription-disable.ts`, `post-subscription-secret.ts`, `update-subscription.ts`)** — Downstream consumers that gate their mutations on the flags this file defines.
- **`src/modules/webhooks/services/subscriptions.ts` / `deliveries.ts`** — Service-layer orchestrators that call into the action helpers to build responses or enforce preconditions.

## Notes

- The module deliberately splits each rule into a **standing** (caller capability) half and a **state** (record fact) half so the list endpoint can compute flags from the lean stored row without an extra query.
- `reads` is a *function* rather than a fixed boolean because the catalogue rule is per-event; callers pass whichever event set is relevant (all filter types for `createSecret`, a single type for `replay`).
- `deleteSecret` requires `secretCount > 1` — a subscription's secret ring is never allowed to become empty (enforced as a 422 elsewhere).
- `createSecret` requires the caller to pass `reads` for **every** event type in the stored filter, not just one, because a newly minted secret signs for the whole filter.
