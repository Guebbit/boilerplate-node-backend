---
source: src/modules/webhooks/services/deliveries.ts
sha256: 4e35b5fb5d8d4339ea09b7fba349de34b1f6852c033d71d250e08c0419299f9d
generated_at: 2026-11-08T09:06:16.011757+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/deliveries.ts

## Purpose

Implements the three delivery-log operations exposed on the webhook delivery endpoint: paged `list`, single `get`, and synchronous `replay` (re-send). It sits between the HTTP handler layer and the repository/attempt primitives, handling filter remapping, action-shaping, lease claims, and audit recording.

## Key elements

- **`DeliveryListFilters`** — interface mirroring the `openapi.yaml` query params (`subscriptionId`, `status`, `page`, `pageSize`).
- **`subscriptionIdOf`** — coerces a delivery row's `subscriptionId` (stored ObjectId) to the wire string type.
- **`list`** — paged, tenant-scoped delivery log (newest first). Remaps filter keys to the repository's search-spec keys, then enriches each row with `deliveryActions` based on a single batched `findEnabledIdsAmong` read.
- **`get`** — fetches one delivery by id within the caller's tenant; 404 if missing. Returns the row shaped by `presentWebhookDelivery` with computed actions.
- **`rejectInProgress`** — builds the shared 409 `WEBHOOK_DELIVERY_IN_PROGRESS` response.
- **`replay`** — re-sends one delivery synchronously against the subscription's *current* URL and secret ring. Sequence: tenant-scoped lookup → subscription existence check → disabled check → `claimForReplay` → `attemptDelivery` → audit → re-read enabled status → present. Returns 404, 409 (disabled), or 409 (in-progress) as appropriate.

## Relationships

- **`../repository.ts`** — calls `webhookDeliveryRepository.search / findByIdInTenant / claimForReplay` and `webhookSubscriptionRepository.findEnabledIdsAmong / findById`; uses `WEBHOOK_DELIVERY_SORT`.
- **`./attempt.ts`** — delegates the actual HTTP send to `attemptDelivery` (replay path only).
- **`./actions.ts`** — calls `deliveryActions` and `standingOn` to compute the per-row action set from the caller's role and the subscription's enabled state.
- **`../presenters.ts`** — calls `presentWebhookDelivery` to shape the final wire response for `get` and `replay`.
- **`../audit.ts`** — uses `webhooksAuditActions.ADMIN_WEBHOOK_DELIVERY_REPLAYED` for the audit record.
- **`@infrastructure/observability/audit.ts`** — calls `recordAudit` after a successful replay.
- **`@infrastructure/http/response.ts`** — builds all success/reject responses via `generateSuccess` / `generateReject`.
- **`@infrastructure/i18n`** — localises error messages via `t`.
- **`@infrastructure/persistence/create-repository.ts`** — imports the `PaginatedResult` type used by `list`.
- **`@types`** — imports `TenantCallerContext` (auth context) and `WebhookDelivery`.
- **`services/index.ts`** — re-exports these functions for the route layer.
- **`tests/integration/delivery-log.test.ts`** — integration-tests `list`.
- **`tests/integration/delivery.test.ts`** — integration-tests `get` and `replay`.

## Notes

- **Filter key remapping is intentional:** the wire param is `subscriptionId` but the repository search-spec key is `subscription`. The remap lives here (not in the repository) so the contract and the collection field can evolve independently.
- **`subscriptionIdOf` is a real conversion**, not a no-op cast: the DB stores an ObjectId while the wire type is a string.
- **Replay uses the subscription's *current* URL and secret ring**, not the ones the row was originally attempted with. It updates the same row in place and shares `attemptDelivery`'s bookkeeping (does not pre-increment `attempt`).
- **Claim ordering in `replay` is deliberate:** the subscription lookup and disabled check happen *before* `claimForReplay`. A 404 or 409-disabled must never leave the row under a 60 s `in_flight` lease with no owner.
- **Post-replay enabled re-read:** a failed replay that exhausts the backoff chain can trip the subscription's auto-disable guard, so the final `actions.replay` flag is computed from a fresh `findEnabledIdsAmong` call rather than the pre-claim read.
