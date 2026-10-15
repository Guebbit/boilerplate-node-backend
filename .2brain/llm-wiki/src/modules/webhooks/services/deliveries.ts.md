---
source: src/modules/webhooks/services/deliveries.ts
sha256: 1d0cb8dd78f8d63f8215ace204665a0d5f5fb3f23c864e5646fdcdb4d9301c4c
generated_at: 2026-10-15T12:21:20.512724+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/deliveries.ts

## Purpose

Provides the two read-and-write operations exposed on the delivery log endpoint: a paged, filterable `list` for `GET /webhooks/deliveries` and a synchronous `replay` that re-sends a single delivery against the subscription's *current* URL and secret ring.

## Key elements

- **`DeliveryListFilters`** – Interface mirroring the query parameters declared in `openapi.yaml` (`subscriptionId`, `status`, `page`, `pageSize`). Used as the `list` input.
- **`list(context, filters)`** – Delegates to `webhookDeliveryRepository.search` with the tenant scope and the shared `WEBHOOK_DELIVERY_SORT` spec. Remaps `subscriptionId` → `subscription` at this layer so the wire name and the collection field name can diverge independently.
- **`replay(id, context)`** – (1) Loads the delivery in-tenant (404 if absent). (2) Loads the subscription by `delivery.subscriptionId` (404 if gone). (3) Claims the row via `webhookDeliveryRepository.claimForReplay` (409 if lease held). (4) Calls `attemptDelivery` with the *current* subscription. (5) Records an audit entry and returns the updated document.
- **`rejectInProgress()`** – Small helper that builds the shared 409 response (`WEBHOOK_DELIVERY_IN_PROGRESS` + i18n message) used for both the claim and the `attemptDelivery` failure paths.

## Relationships

- **`../repository` (`src/modules/webhooks/repository.ts`)** – Source of `webhookDeliveryRepository`, `webhookSubscriptionRepository`, and `WEBHOOK_DELIVERY_SORT`. Both `list` and `replay` call into it.
- **`./attempt` (`src/modules/webhooks/services/attempt.ts`)** – `replay` delegates the actual HTTP send and row-update to `attemptDelivery`, sharing the same attempt-counting / backoff logic as the queued worker path.
- **`../audit` (`src/modules/webhooks/audit.ts`)** – Supplies `webhooksAuditActions.ADMIN_WEBHOOK_DELIVERY_REPLAYED` for the audit record written after a successful replay.
- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` shape every HTTP response returned by `list`'s caller and by `replay`.
- **`@infrastructure/i18n`** – `t()` provides localized error and status messages.
- **`@infrastructure/observability/audit`** – `recordAudit` is called once per successful replay.
- **`@infrastructure/persistence/create-repository`** – Provides the `PaginatedResult<T>` return type for `list`.
- **`@types`** – `TenantCallerContext` (auth/tenant scope) and `WebhookDelivery` (list element type).
- **`../model`** – `WebhookDeliveryDocument` is the success-payload type for `replay`.
- **`services/index.ts`** – Re-exports `list` and `replay` for route handlers.
- **Tests** – `delivery-log.test.ts` exercises `list`; `delivery.test.ts` exercises `replay` (404, 409, success paths).

## Notes

- **Claim-before-attempt, but look-up-before-claim.** The subscription is resolved *before* `claimForReplay` is called. If the subscription is gone, the row is left unclaimed, avoiding a 60-second stranded lease that would only be reclaimed as `exhausted` by the sweep.
- **Replay does not pre-increment `attempt`.** `attemptDelivery` owns the ordinal bump; calling a caller-side bump first would double-count the single real HTTP attempt.
- **Replay uses the subscription's *current* URL and secret ring**, not the values captured when the delivery row was originally created. This is intentional: the row is updated in place to reflect the re-send.
- **Filter remapping is local to this file.** `subscriptionId` (wire name) is mapped to `subscription` (collection field) inside `list`; neither the OpenAPI contract nor the repository spec is aware of the other's naming.
