---
source: src/modules/webhooks/openapi.yaml
sha256: 3d1a031a67d8595c92b3b8516e5a8f4b2d0499dcdd2175673d2b41cbdc0a6f19
generated_at: 2026-11-08T09:04:05.144145+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract for the webhooks domain. It defines the complete public API surface for outbound webhook subscriptions—creation, read, update, delete, enable/disable, secret management, delivery log, replay, and the event catalogue—along with the module's custom error-code vocabulary. Consumers (SDKs, gateway validators, docs generators) treat this file as the single source of truth for request/response shapes and state-machine transitions.

## Key elements

- **`tags` / `x-family: Core`** — All operations are filed under the `Webhooks` tag; the `x-family` extension groups them for cross-module discovery.
- **`x-error-codes`** (top-level) — Five module-specific 409 codes: `WEBHOOK_DELIVERY_IN_PROGRESS`, `WEBHOOK_SUBSCRIPTION_LIMIT_REACHED`, `WEBHOOK_SUBSCRIPTION_ALREADY_ENABLED`, `WEBHOOK_SUBSCRIPTION_ALREADY_DISABLED`, `WEBHOOK_SUBSCRIPTION_DISABLED`. Individual operations narrow the set via their own `x-error-codes`.
- **`/webhooks/subscriptions`** — `GET` (list with pagination, sort, `enabled`/`autoDisabled` filters) and `POST` (create; returns one-time plaintext secret; enforces SSRF check on `url`).
- **`/webhooks/subscriptions/{id}`** — `GET`, `PUT` (full replace of url/description/eventTypes), `PATCH` (partial; also accepts `application/merge-patch+json`), `DELETE` (removes subscription, preserves delivery log).
- **`/webhooks/subscriptions/{id}/enable`** — `POST`; clears `disabledAt`/`autoDisabledAt`, resets failure streak; 409 if already enabled.
- **Schemas** (referenced, defined elsewhere in this file or shared): `WebhookSubscription`, `WebhookSubscriptionsResponse`, `CreateWebhookSubscriptionRequest`, `WebhookSubscriptionCreated`, `ReplaceWebhookSubscriptionRequest`, `UpdateWebhookSubscriptionRequest`, `WebhookSubscriptionSort`.
- **Security** — Every operation accepts `bearerAuth` **or** `apiKeyAuth` (alternative scheme).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Referenced for shared parameters (`PageParam`, `PageSizeParam`, `IdPathParam`), standard error responses (`Unauthorized`, `Forbidden`, `ValidationError`, `Conflict`, `NotFound`, `NoContent`), and the `Location` response header. Changing any of those shared definitions propagates into every webhook endpoint here.
- **`src/modules/webhooks/rules.yaml`** — Supplies the business/validation rules that the operations above enforce (subscription limits, SSRF guard, enable/disable state machine, failure-streak auto-disable). The spec documents *what* the API returns; the rules file documents *why* a given 409/422 fires.

## Notes

- **Secret is ephemeral**: the plaintext ring is returned exactly once—on `POST /subscriptions` or on a secret-rotation call. No subsequent `GET`/`PUT`/`PATCH` ever includes it.
- **SSRF guard runs twice**: at write time (422 with `errors[].details { field: url }`, deliberately no internal-address detail) and again on every delivery, since DNS can change post-creation.
- **PUT vs. PATCH semantics**: `PUT` is a full replace—omitted `description` is cleared. `PATCH` is additive. Neither touches the secret ring or enable/disable state; those live on dedicated action routes.
- **Enable is idempotent-safe but streak-preserving**: a repeated `enable` on an already-on subscription returns 409 and does *not* reset the failure streak.
- **Delete is soft with respect to logs**: the subscription row is removed, but its delivery log entries remain for audit.
- **Sort grammar** follows JSON:API: comma-separated fields, `-` prefix for descending (e.g. `?sort=-createdAt,url`).
