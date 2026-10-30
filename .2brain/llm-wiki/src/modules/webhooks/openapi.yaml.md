---
source: src/modules/webhooks/openapi.yaml
sha256: b01abfa162b2a3fe1dab122ec970248f6a6218bfb630f7027804381d821a0da8
generated_at: 2026-10-29T06:28:06.925040+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **webhooks** module. It defines the REST surface for outbound webhook subscriptions (CRUD, enable/disable, secret management, replay, and the public event catalogue), along with a module-specific set of 409 error codes and the schemas that back each endpoint.

## Key elements

- **`x-error-codes`** — Custom OpenAPI extension declaring five module-scoped 409 error codes (`WEBHOOK_DELIVERY_IN_PROGRESS`, `WEBHOOK_SUBSCRIPTION_LIMIT_REACHED`, `WEBHOOK_SUBSCRIPTION_ALREADY_ENABLED`, `WEBHOOK_SUBSCRIPTION_ALREADY_DISABLED`, `WEBHOOK_SUBSCRIPTION_DISABLED`) with their status and human-readable descriptions.
- **`tags`** — Single `Webhooks` tag scoping all operations; its description names the four sub-domains (subscriptions, delivery log, replay, event catalogue).
- **`paths`** — Full REST tree:
  - `GET/POST /webhooks/subscriptions` — list (with pagination, sort, `enabled`/`autoDisabled` filters) and create (one-time plaintext secret in the 201 body).
  - `GET/PUT/PATCH/DELETE /webhooks/subscriptions/{id}` — read, full-replace, partial-update (accepts both `application/json` and `application/merge-patch+json`), and delete.
  - `POST /webhooks/subscriptions/{id}/enable` (and, per truncation, `/disable`, secret rotation, replay, delivery-log endpoints).
- **`components/schemas`** — Request/response schemas (`WebhookSubscription`, `CreateWebhookSubscriptionRequest`, `ReplaceWebhookSubscriptionRequest`, `UpdateWebhookSubscriptionRequest`, `WebhookSubscriptionsResponse`, `WebhookSubscriptionCreated`, `WebhookSubscriptionSort`, …).
- **`security`** — Every operation accepts `bearerAuth` *or* `apiKeyAuth`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — This spec `$ref`s into that file for: pagination parameters (`PageParam`, `PageSizeParam`), `IdPathParam`, the `Location` response header, and the shared standard responses (`Unauthorized`, `Forbidden`, `ValidationError`, `Conflict`, `NotFound`, `NoContent`). Any change to those shared definitions propagates into this module's contract.
- **`tests/audit/compliance-rules.yaml`** — Consumes this spec (and the shared root) as input for automated compliance/audit checks; the `x-error-codes` block and the security scheme on every operation are the items those rules validate against.

## Notes

- **Secret visibility:** The plaintext signing secret appears **only** in the 201 response of `POST /webhooks/subscriptions` or the 200 of a secret-mint endpoint. Every list/get/put/patch response omits it by design.
- **Sort grammar:** The `sort` query parameter follows JSON:API conventions (`?sort=-createdAt,url`), not a custom format.
- **SSRF guard:** The destination URL must be `https://` and must not resolve to a private/loopback/link-local address. Resolution happens at create **and** again on every delivery (DNS can change), so a 422 at creation time is only the first check.
- **PUT vs PATCH semantics:** `PUT` is a full replace — omitting `description` clears it. `PATCH` is a partial update. Neither touches the secret ring or the enabled flag.
- **Enable idempotency trap:** Calling `POST …/enable` on an already-enabled subscription returns **409** and does **not** reset the failure streak. A healthy subscription's streak is only reset by a genuine enable-after-disable.
- **Delete is not hard:** `DELETE` removes the subscription but deliberately preserves its delivery log for audit.
- **`autoDisabled` filter:** Use together with `enabled=false` to isolate manual pauses from guard-triggered ones (`autoDisabledAt` set vs. unset).
