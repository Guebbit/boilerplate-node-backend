---
source: src/modules/webhooks/services/deliveries.ts
sha256: 319e773f6560f23b23b43f5521a715cb18397dff11a07bb7ecca0132b5a142a3
generated_at: 2026-09-23T19:42:23.315116+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/deliveries.ts

## Purpose

Implements the two operations on the webhook delivery log: **list** (paged, filterable read) and **replay** (synchronous re-send of a single delivery against the subscription's *current* URL and secret ring). It is the service layer that HTTP handlers call for `GET /webhooks/deliveries` and `POST /webhooks/deliveries/:id/replay`.

## Key elements

- **`DeliveryListFilters`** — interface mirroring the `openapi.yaml` query params (`subscriptionId`, `status`, `page`, `pageSize`). Note the wire name `subscriptionId` is remapped to the repository key `subscription` inside `list`.
- **`list(context, filters)`** — returns `Promise<PaginatedResult<WebhookDelivery>>`. Delegates to `webhookDeliveryRepository.search` with a tenant-scoped scope and `WEBHOOK_DELIVERY_SORT`.
- **`replay(id, context)`** — returns `Promise<ResponseSuccess<WebhookDeliveryDocument> | ResponseReject>`. Flow: find-by-id (404 if not this tenant's) → find subscription (404 if gone) → `claimForReplay` (409 on lease conflict) → `attemptDelivery` → `recordAudit` + `generateSuccess`.
- **`rejectInProgress()`** (private) — factory for the shared 409 `WEBHOOK_DELIVERY_IN_PROGRESS` response.

## Relationships

- **`../repository`** — provides `webhookDeliveryRepository`, `webhookSubscriptionRepository`, and `WEBHOOK_DELIVERY_SORT`; all data access goes through these.
- **`./attempt` (`attemptDelivery`)** — the actual sign-and-POST logic. Replay delegates to it rather than duplicating the HTTP call, so bookkeeping (attempt ordinal, backoff) is shared with the queued path.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types shape every return value.
- **`@infrastructure/i18n`** — `t()` for user-facing error messages (`webhooks.delivery-in-progress`, `webhooks.subscription-not-found`, `generic.error-not-found`).
- **`@infrastructure/observability/audit`** — `recordAudit` is called once, after a successful replay, with the `ADMIN_WEBHOOK_DELIVERY_REPLAYED` action.
- **`../audit` (`webhooksAuditActions`)** — supplies the audit action constant used above.
- **`@types` / `../model`** — `TenantCallerContext`, `WebhookDelivery`, and `WebhookDeliveryDocument` define the type surface.
- **`@infrastructure/persistence/create-repository`** — `PaginatedResult` generic type for the `list` return.
- **`src/modules/webhooks/tests/integration/delivery.test.ts`** — integration test that exercises both `list` and `replay`.

## Notes

- **Replay uses the subscription's *current* URL/secret, not the ones stored on the delivery row.** This is intentional: a replay reflects the subscription's present configuration.
- **Attempt ordinal is *not* bumped before calling `attemptDelivery`.** `attemptDelivery` handles its own bookkeeping; pre-bumping would double-count the single HTTP call.
- **Subscription lookup precedes the lease claim.** A 404 after a claim would leave the row `in-flight` under a 60 s lease with no one to finish it, until the stranded-lease sweep eventually marks it `exhausted`.
- **`list` remaps `subscriptionId` → `subscription`** so the wire contract and the repository's field name can diverge independently.
- **`page` / `pageSize` in `DeliveryListFilters` are typed `unknown`**, matching the raw query-string values before the repository parses them.
