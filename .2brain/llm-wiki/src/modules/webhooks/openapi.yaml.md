---
source: src/modules/webhooks/openapi.yaml
sha256: 3c871e98b89b87aabef80d0fb68d99049ea5b635133256a5031706ae7fc15e38
generated_at: 2026-09-23T19:41:01.872104+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/openapi.yaml

## Purpose

OpenAPI 3.0.3 module contract that defines the full REST surface of the webhooks service: subscription CRUD, the delivery log, single-delivery replay, and the public event catalogue. It serves as the single source of truth that code generators (orval/zod) and audit tooling consume.

## Key elements

- **`/webhooks/subscriptions` (GET, POST)** — List (with `enabled` filter and pagination) and create subscriptions. Creation is the only call that returns the minted secret in plaintext.
- **`/webhooks/subscriptions/{id}` (PATCH, DELETE)** — Partial update; `rotateSecret` adds a new ring secret and returns `newSecret` in plaintext, while `removeSecretId` drops an old one. Delete removes the subscription but preserves its delivery log for auditability.
- **`/webhooks/deliveries` (GET)** — Read-only delivery log, filterable by `subscriptionId` and `status` (enum `WebhookDeliveryStatus`).
- **`/webhooks/deliveries/{id}/replay` (POST)** — Synchronously re-signs and re-POSTs against the subscription's _current_ URL and secret ring. Mutates the same row's `attempt`, `status`, `responseCode`, `durationMs`, `error`. Returns **409** (`WEBHOOK_DELIVERY_IN_PROGRESS`) if a live worker holds the delivery lease.
- **`/webhooks/events` (GET)** — Returns the public event catalogue, sourced from the module's own `asyncapi.yaml` fragment so it cannot drift from what the module actually fires.
- **`components/schemas`** — Module-local schemas: `WebhookSubscription`, `CreateWebhookSubscriptionRequest`, `UpdateWebhookSubscriptionRequest`, `WebhookSubscriptionsResponseEnvelope`, `WebhookSubscriptionCreatedEnvelope`, `WebhookDeliveriesResponseEnvelope`, `WebhookDeliveryEnvelope`, `WebhookEventCatalogueResponseEnvelope`, `WebhookDeliveryStatus`.
- **`components` shared refs** — All pagination params, `IdPathParam`, and standard error responses (`401`, `403`, `404`, `409`, `422`, `500`, `Success`) are pulled from `shared/contracts/openapi.root.yaml`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Referenced extensively via `$ref` for reusable parameters (`PageParam`, `PageSizeParam`, `IdPathParam`) and standard error/success response objects. This file is the sole consumer of those shared definitions within the webhooks module.
- **`tests/audit/compliance-rules.yaml`** — Consumes this spec as the auditable surface; compliance rules are validated against the operations, security schemes, and response shapes declared here.

## Notes

- **URL pattern workaround:** Every `url` schema field uses `(?:^https://…)` (non-capturing group) instead of a bare `^https://…`. Orval's zod generator strips a trailing `/` from regex patterns (assuming a `/regex/` delimiter), which would silently degrade the pattern to `^https:/`. The closing `)` prevents the strip.
- **Secret visibility is one-shot:** The plaintext secret appears only in the `POST` (create) or `PATCH` (rotate) response. No other endpoint returns it.
- **DNS re-check on every delivery:** The `https://` + non-private-address validation runs at delivery time, not only at creation, because a subscription's DNS can change after setup.
- **Replay is not a re-attempt:** It signs with the _current_ ring, not the historical one, and advances `attempt` by exactly one step if backoff tiers remain (unchanged on success or exhaustion).
- **Event catalogue coupling:** The catalogue endpoint reads from the same `asyncapi.yaml` fragment that generates `asyncapi.public.yaml` (see `docs/api/asyncapi-workflow.md`), guaranteeing the list matches what the module can fire.
- **409 on replay only:** The Conflict response is specific to the replay endpoint and signals an in-flight delivery lease, not a general optimistic-locking mechanism.
