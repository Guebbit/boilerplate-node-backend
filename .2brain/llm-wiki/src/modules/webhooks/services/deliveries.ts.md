---
source: src/modules/webhooks/services/deliveries.ts
sha256: 1b0cbae120a7cba7c613627ff3c92aa0092a974b19f19f2fea4e387af0914de2
generated_at: 2026-10-29T06:30:02.702227+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/deliveries.ts

## Purpose

Service layer for the webhook delivery log's three API operations: paged listing, single-item read, and synchronous replay (re-send). It translates wire-level query parameters into repository searches, computes per-row `actions` from the subscription's enabled state and the caller's standing, and orchestrates the multi-step replay flow (lookup → subscription check → lease claim → attempt → audit).

## Key elements

- **`DeliveryListFilters`** — interface mirroring the `GET /webhooks/deliveries` query params (`subscriptionId`, `status`, `page`, `pageSize`).
- **`subscriptionIdOf(row)`** — coerces a lean row's stored ObjectId to a `string` for use in `Set`/`Map` lookups.
- **`list(context, filters)`** — paged, newest-first delivery search. Remaps the wire key `subscriptionId` → repository key `subscription`. Batch-checks which subscriptions in the page are enabled, then attaches computed `actions` to every row.
- **`get(id, context)`** — single delivery lookup scoped to the caller's tenant. Returns 404 for unknown id or cross-tenant id. Attaches `actions` and shapes via `presentWebhookDelivery`.
- **`rejectInProgress()`** — builds the standard 409 `WEBHOOK_DELIVERY_IN_PROGRESS` response.
- **`replay(id, context)`** — re-sends one delivery against the subscription's *current* URL and secret ring. Validates subscription existence and enabled state *before* claiming the lease. Claims via `claimForReplay`, delegates the actual HTTP attempt to `attemptDelivery`, records an audit event, re-reads the subscription's enabled state (auto-disable guard), and returns the updated row with fresh `actions`.

## Relationships

- **`../repository.ts`** — supplies `webhookDeliveryRepository` (search, `findByIdInTenant`, `claimForReplay`), `webhookSubscriptionRepository` (findById, `findEnabledIdsAmong`), and the `WEBHOOK_DELIVERY_SORT` cursor/order spec.
- **`./attempt.ts`** — `replay` delegates the actual signed POST and row update to `attemptDelivery`, sharing the same backoff/exhaustion bookkeeping as the queued path.
- **`./actions.ts`** — `deliveryActions(enabled, standing)` and `standingOn(context)` compute the per-row action set shown to the caller.
- **`../presenters.ts`** — `presentWebhookDelivery` shapes the final response payload for `get` and `replay`.
- **`../audit.ts`** — provides the `webhooksAuditActions.ADMIN_WEBHOOK_DELIVERY_REPLAYED` constant used in the audit record.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` for all response envelopes.
- **`@infrastructure/i18n`** — `t()` for localized error and status messages.
- **`@infrastructure/observability/audit`** — `recordAudit` after a successful replay.
- **`@infrastructure/persistence/create-repository`** — `PaginatedResult` return type for `list`.
- **`@types` (`src/types/index.ts` → `auth-context.ts`)** — `TenantCallerContext` (tenant scoping, caller identity) and `WebhookDelivery` domain type.
- **`src/modules/webhooks/tests/integration/delivery.test.ts`** and **`delivery-log.test.ts`** — integration tests exercising `list`, `get`, and `replay`.

## Notes

- **Replay vs. queued attempt:** `replay` does *not* bump the attempt counter before calling `attemptDelivery`; the ordinal is whatever the row already holds. A caller-side pre-bump would double-count the single HTTP call.
- **Lease ordering in `replay`:** the subscription is looked up and its `disabledAt` checked *before* `claimForReplay`. A refusal after claiming would strand the row `in-flight` under a 60 s lease with no worker to finish it.
- **Post-replay enabled re-check:** a failed replay that exhausts the backoff chain can trigger the auto-disable guard, so the response re-reads `findEnabledIdsAmong` to reflect the subscription's possibly-changed state in `actions`.
- **Filter remapping:** the wire parameter is `subscriptionId`; the repository search spec key is `subscription`. The mapping lives in this file, not in the repository, so either side can rename independently.
