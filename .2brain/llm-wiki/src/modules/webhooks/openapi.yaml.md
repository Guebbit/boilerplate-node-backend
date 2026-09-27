---
source: src/modules/webhooks/openapi.yaml
sha256: 028629a20b996b531ee1b8dfe70d79443a2a0b775ceed7f6ace9c3df6bf85ae3
generated_at: 2026-09-27T15:42:44.438845+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/openapi.yaml

## Purpose

OpenAPI 3.0.3 module contract for the webhooks subsystem. It defines the full REST surface for managing webhook subscriptions (CRUD), the secret-ring lifecycle (rotate / drop), and the delivery log, serving as the single source of truth for the API shape that both the server implementation and clients (SDKs, UIs) must conform to.

## Key elements

- **`/webhooks/subscriptions`** — `GET` lists a shop's subscriptions (paginated, optional `enabled` filter); `POST` creates one and returns the one-time plaintext secret in `201`.
- **`/webhooks/subscriptions/{id}`** — `PUT` full-replace of url/description/eventTypes/enabled; `PATCH` partial update; `DELETE` removes the subscription (delivery log is retained for audit).
- **`/webhooks/subscriptions/{id}/rotate-secret`** (`POST`) — adds a new secret to the ring, returns its plaintext once; old secret remains active until explicitly dropped.
- **`/webhooks/subscriptions/{id}/secrets/{secretId}`** (`DELETE`) — removes one secret from the ring; refuses to empty the ring entirely.
- **`/webhooks/deliveries`** (`GET`) — paginated delivery log, filterable by subscription and status (newest first). *(Truncated in source.)*
- **Schemas** (under `components/schemas`) — `CreateWebhookSubscriptionRequest`, `ReplaceWebhookSubscriptionRequest`, `UpdateWebhookSubscriptionRequest`, `WebhookSubscriptionEnvelope`, `WebhookSubscriptionCreatedEnvelope`, `WebhookSubscriptionsResponseEnvelope`. *(Truncated in source.)*
- **Security** — every operation requires `bearerAuth`.
- **Tags** — all operations are tagged `Webhooks`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — This file `$ref`s shared parameters (`PageParam`, `PageSizeParam`, `IdPathParam`) and shared error responses (`Unauthorized`, `Forbidden`, `ValidationError`, `NotFound`, `InternalError`, `Success`) from the root contract. Keeping those in one place means the webhook spec only declares module-specific schemas and paths.
- **`tests/audit/compliance-rules.yaml`** — Consumed by the compliance/audit test suite that validates this OpenAPI document against organizational API standards (naming, security, error-envelope conventions, etc.). Changes here may require updating those rules or vice-versa.

## Notes

- **One-time secret disclosure:** The plaintext secret appears *only* in the response of the call that mints it (`POST /subscriptions` or `POST .../rotate-secret`). Every subsequent read returns only `secretIds`. Any client that misses that response must rotate.
- **PUT vs PATCH semantics:** `PUT` is a full replace — omitting `description` clears it. `PATCH` is partial; omitted fields are left unchanged. Neither touches the secret ring.
- **Secret rotation is a command route, not a flag:** It lives at its own path rather than as a field on `PATCH` so that the command (mint a new secret) is never conflated with a state update (change url/eventTypes).
- **SSRF guard is described, not enforced here:** The spec states that `url` must be `https://` and must not resolve to a private/loopback/link-local address, and that the check re-runs on every delivery (DNS can change). The actual enforcement lives in the implementation, not in the OpenAPI schema.
- **File is truncated:** The `components` block (schemas, and possibly additional shared refs) and the tail of the deliveries endpoint are not fully present in the source excerpt above.
