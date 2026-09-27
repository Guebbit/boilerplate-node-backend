---
source: src/modules/webhooks/services/deliveries.ts
sha256: 7fb42c73ecea97ba6ffd44fb310727bd38cb4caee578ea428ce38e37a2b2a5e8
generated_at: 2026-09-27T15:43:56.325318+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/deliveries.ts

## Purpose

Service layer for the webhook delivery log. Provides the two read-and-write operations surfaced by the API: `list` (paged, filterable log of deliveries) and `replay` (synchronous re-send of a single delivery against the subscription's *current* URL and secret ring).

## Key elements

- **`DeliveryListFilters`** – Interface mirroring the query parameters declared in `openapi.yaml` for `GET /webhooks/deliveries` (`subscriptionId`, `status`, `page`, `pageSize`).
- **`list(context, filters)`** – Paged search over the tenant's delivery log, newest first. Remaps the wire-level filter keys to the repository's internal keys (e.g. `subscriptionId` → `subscription`) before delegating to `webhookDeliveryRepository.search`.
- **`rejectInProgress()`** – Private helper returning a pre-built 409 `ResponseReject` with the `WEBHOOK_DELIVERY_IN_PROGRESS` error code and an i18n message.
- **`replay(id, context)`** – Re-sends a single delivery synchronously. Sequence: find delivery in tenant → verify subscription still exists → `claimForReplay` (lease) → delegate to `attemptDelivery` → record audit. Returns 404 (delivery or subscription missing), 409 (lease already held), or 200 with the updated document.

## Relationships

- **`../repository.ts`** – Calls `webhookDeliveryRepository.search`, `.findByIdInTenant`, `.claimForReplay`; uses `WEBHOOK_DELIVERY_SORT` and `webhookSubscriptionRepository.findById`.
- **`./attempt.ts`** – `replay` delegates the actual HTTP attempt to `attemptDelivery`, sharing its bookkeeping (attempt counter, backoff tiers) rather than managing state independently.
- **`@infrastructure/http/response`** – Builds all API responses via `generateSuccess` / `generateReject`.
- **`@infrastructure/i18n`** – Translates error messages (`webhooks.delivery-in-progress`, `webhooks.subscription-not-found`, `generic.error-not-found`).
- **`@infrastructure/observability/audit`** – Records an audit event (`recordAudit`) after a successful replay.
- **`../audit.ts`** – Supplies the `webhooksAuditActions.ADMIN_WEBHOOK_DELIVERY_REPLAYED` action constant.
- **`@types`** – Consumes `TenantCallerContext` (caller/tenant identity) and `WebhookDelivery` (domain type for list results).
- **`../model.ts`** – Uses `WebhookDeliveryDocument` as the return type of `replay`.
- **`services/index.ts`** – Barrel re-export so routes can import `list`/`replay` from the services namespace.
- **`tests/integration/delivery.test.ts`** – Integration tests exercising both `list` and `replay` paths.

## Notes

- **Filter-key remapping is intentional.** The API query param is `subscriptionId`; the repository's internal filter key is `subscription`. The mapping lives here (not in the repository) so the wire contract and the collection schema can evolve independently.
- **Replay uses the subscription's *current* URL and secret ring**, not the values captured when the delivery row was originally written. This is a deliberate design choice for re-sending after a URL or key rotation.
- **Subscription lookup precedes `claimForReplay`.** A 404 must never claim the lease first, because an orphaned 60-second lease would strand the row in `in-flight` until the sweep reclaims it as `exhausted`.
- **Attempt counting is shared with the queued path.** `attemptDelivery` handles the `attempt` ordinal; `replay` does *not* pre-increment it. A caller-side bump would double-count the single HTTP call the replay actually makes.
- **409 semantics:** both a live queued worker holding the lease and a concurrent replay produce the same `WEBHOOK_DELIVERY_IN_PROGRESS` 409 — the lease is the single concurrency guard.
