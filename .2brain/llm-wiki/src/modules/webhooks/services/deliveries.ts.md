---
source: src/modules/webhooks/services/deliveries.ts
sha256: 3102be09c21ba542c58bc621679339565f75a73a11ea34520bb8d00c60534497
generated_at: 2026-11-14T22:46:49.995231+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/deliveries.ts

## Purpose

Service layer for the webhook delivery log: paged **list**, single **get**, and synchronous **replay** (re-send). It sits between the HTTP handlers (which supply filters and tenant context) and the repositories/attempt engine, shaping responses with presenters, action hints, and i18n'd error payloads.

## Key elements

- **`DeliveryListFilters`** — interface mirroring the `openapi.yaml` query params for `GET /webhooks/deliveries` (`subscriptionId`, `status`, `page`, `pageSize`).
- **`subscriptionIdOf(row)`** — coerces a stored ObjectId (or whatever the row carries) to the wire-type `string`. Real conversion, not a no-op cast.
- **`list(context, filters)`** — paged search via `webhookDeliveryRepository.search` (newest-first sort). After fetching the page, performs one batched `findEnabledIdsAmong` call to attach a per-row `actions` array (whether replay is available, derived from subscription enabled-state + caller standing).
- **`get(id, context)`** — single-delivery lookup scoped to the caller's tenant; 404 for unknown or cross-tenant ids. Returns the row shaped by `presentWebhookDelivery` with computed actions.
- **`rejectInProgress()`** — builds the shared 409 `WEBHOOK_DELIVERY_IN_PROGRESS` response used by `replay` for both the lease-contention path and the `attemptDelivery`-returned-nothing path.
- **`replay(id, context)`** — re-sends a delivery synchronously against the subscription's *current* URL and secret ring. Full sequence: tenant-scoped lookup → event-read-ability check → subscription existence + disabled check → `claimForReplay` lease → `attemptDelivery` → audit record → re-read enabled state (auto-disable guard) → present response.

## Relationships

- **`src/modules/webhooks/repository.ts`** — supplies `webhookDeliveryRepository`, `webhookSubscriptionRepository`, and the `WEBHOOK_DELIVERY_SORT` sort spec used by `list`.
- **`src/modules/webhooks/services/attempt.ts`** — `replay` delegates the actual HTTP send and in-place row update to `attemptDelivery`; no separate bump is applied.
- **`src/modules/webhooks/services/actions.ts`** — `deliveryActions` and `standingOn` produce the per-row action hints in `list`, `get`, and `replay` responses.
- **`src/modules/webhooks/services/catalog.ts`** — `unreadableEventTypes` gates whether the caller may read (and therefore replay) the stored event payload.
- **`src/modules/webhooks/services/read-refusal.ts`** — `rejectEventReadRequired` builds the 403 response when the caller lacks event-read permission.
- **`src/modules/webhooks/presenters.ts`** — `presentWebhookDelivery` shapes the final delivery row for wire output.
- **`src/modules/webhooks/audit.ts`** — `webhooksAuditActions.ADMIN_WEBHOOK_DELIVERY_REPLAYED` is the action tag passed to `recordAudit` after a successful replay.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` wrap all return values; `ResponseSuccess` / `ResponseReject` are the union members in signatures.
- **`src/infrastructure/i18n/index.ts`** — `t` localizes every user-facing error string.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` logs the replay as an admin action.
- **`src/infrastructure/persistence/create-repository.ts`** — provides the `PaginatedResult<T>` type that `list` resolves to.
- **`src/modules/webhooks/services/index.ts`** — barrel re-exports for this module (consumers import from the barrel, not this file directly).
- **`src/modules/webhooks/tests/integration/delivery.test.ts`**, **`src/modules/webhooks/tests/integration/delivery-log.test.ts`** — integration coverage for `list`, `get`, and `replay`.

## Notes

- **Filter-key remap is intentional.** The wire param is `subscriptionId`; the repository's search spec key is `subscription`. The mapping happens *here*, so neither the OpenAPI contract nor the repository is coupled to the other's naming.
- **Replay ordering is load-bearing.** The subscription existence and disabled checks run *before* `claimForReplay`. If a 404 or 409 fired *after* claiming, the row would sit `in_flight` under a 60 s lease with no one left to finish it until the stranded-lease sweep reclaims it as `exhausted`.
- **No caller-side attempt bump.** `replay` hands the row to `attemptDelivery` as-is; the ordinal advances (or doesn't) inside `attemptDelivery`'s own bookkeeping. Bumping before the call would double-count the single HTTP attempt.
- **Post-replay enabled re-read is not optional.** A failed replay that exhausts the backoff chain can trip the auto-disable guard, flipping the subscription to disabled. Re-reading `findEnabledIdsAmong` ensures the returned `actions.replay` flag reflects reality.
- **`subscriptionIdOf` is a real conversion.** Lean delivery rows store an ObjectId where the wire type is `string`; the `String(...)` call is necessary, not decorative.
