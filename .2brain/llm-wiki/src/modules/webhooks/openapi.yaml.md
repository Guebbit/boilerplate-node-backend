---
source: src/modules/webhooks/openapi.yaml
sha256: 40be76ced9578b301213c85d2df8b4e8bdc1a152aea2f58b3cf1301e04a41f70
generated_at: 2026-10-15T12:19:36.970479+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the webhooks module: defines the REST surface for managing outbound webhook subscriptions (CRUD), one-time secret minting, secret-ring rotation, and secret removal. Serves as the single source of truth for request/response shapes, validation rules, and error semantics that both the server implementation and external consumers rely on.

## Key elements

- **Tag `Webhooks`** — groups all operations; scope is subscriptions, delivery log, replay, and the public event catalogue.
- **`x-error-codes`** — module-level error vocabulary; currently `WEBHOOK_DELIVERY_IN_PROGRESS` (409).
- **`/webhooks/subscriptions`** (GET / POST) — list (paginated, filterable by `enabled`) and create. Create mints the first secret and returns it in plaintext exactly once.
- **`/webhooks/subscriptions/{id}`** (PUT / PATCH / DELETE) — full replace, partial update (accepts `application/json` and `application/merge-patch+json`), and permanent delete. Neither PUT nor PATCH touches the secret ring.
- **`/webhooks/subscriptions/{id}/rotate-secret`** (POST) — adds a second active secret to the ring; returns the new secret in plaintext once. Command-style route, deliberately separate from PATCH.
- **`/webhooks/subscriptions/{id}/secrets/{secretId}`** (DELETE) — removes one secret from the ring; refuses to leave the ring empty.
- **Components (referenced, defined in `#/components/schemas/`)** — `WebhookSubscription`, `WebhookSubscriptionsResponseEnvelope`, `WebhookSubscriptionCreatedEnvelope`, `CreateWebhookSubscriptionRequest`, `ReplaceWebhookSubscriptionRequest`, `UpdateWebhookSubscriptionRequest`.
- **Security** — every operation accepts `bearerAuth` or `apiKeyAuth`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — this file `$ref`s shared parameters (`PageParam`, `PageSizeParam`, `IdPathParam`), standard error responses (`Unauthorized`, `Forbidden`, `ValidationError`, `InternalError`, `NotFound`, `Success`), and the `Location` header from that root contract. Changes to those shared definitions propagate into every endpoint here.
- **`tests/audit/compliance-rules.yaml`** — audit/test suite that validates this spec against compliance rules (e.g., security, error-shape, and documentation conventions).

## Notes

- **Secret visibility is strictly one-shot.** The plaintext ring secret appears only in the `201`/`200` response of `POST /subscriptions` or `POST .../rotate-secret`. All list/get/put/patch responses return opaque IDs (`secretIds`) only.
- **URL SSRF guard.** `url` must be `https://` and must not resolve to a private, loopback, or link-local address. The check runs at creation/update *and* on every delivery (DNS can shift). A refusal surfaces as `422` with `errors[].details.field = "url"` but deliberately omits which internal address was hit.
- **PUT vs. PATCH semantics.** PUT is a full replace — omitting `description` clears it. PATCH is a partial update.
- **Secret-ring invariants.** At most two active secrets at once. During the overlap window (default 24 h, `NODE_WEBHOOK_SECRET_OVERLAP_HOURS`) deliveries sign with both (`v1,… v1,…` in `webhook-signature`). Rotating again while two are present drops the oldest. `DELETE .../secrets/{id}` refuses to empty the ring.
- **Delete preserves audit trail.** `DELETE /subscriptions/{id}` removes the subscription but leaves its delivery log intact.
- **Merge-patch support.** PATCH explicitly advertises `application/merge-patch+json` alongside `application/json`.
