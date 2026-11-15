---
source: src/modules/webhooks/openapi.yaml
sha256: f408809200816401f5c98e0c38441a2eeae6fde403c4a743152aaac7c70423ab
generated_at: 2026-11-14T22:43:43.321082+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **Webhooks** module. It defines the public REST surface for managing webhook subscriptions (CRUD, enable/disable, secret rotation), the delivery log, replay, and the event catalogue. It is the single source of truth for endpoint shapes, auth scopes, and error semantics that API clients and the bundler consume.

## Key elements

- **`x-error-codes`** (module-level): six webhook-specific error codes (`WEBHOOK_DELIVERY_IN_PROGRESS`, `WEBHOOK_SUBSCRIPTION_LIMIT_REACHED`, `WEBHOOK_SUBSCRIPTION_ALREADY_ENABLED/DISABLED`, `WEBHOOK_EVENT_READ_REQUIRED`, `WEBHOOK_SUBSCRIPTION_DISABLED`) with their HTTP status and human-readable description.
- **`tags`** — a single `Webhooks` tag (`x-family: Core`) that all operations are filed under.
- **`/webhooks/subscriptions` (GET / POST)** — list (with `sort`, `enabled`, `autoDisabled` filters and shared pagination params) and create. Create mints a one-time secret, enforces an SSRF check on `url`, and requires the caller to hold the read rule for every event in the filter.
- **`/webhooks/subscriptions/{id}` (GET / PUT / PATCH / DELETE)** — read, full-replace, partial-update, and delete. PUT and url/eventTypes-carrying PATCH re-check event read rules. PATCH also accepts `application/merge-patch+json`.
- **`x-versioned`** hints on both paths — consumed by the bundler to inject `ETag`, `If-Match`, `Content-Location`, and 412 responses.
- **Security** — every operation requires either `bearerAuth` or `apiKeyAuth` with a per-verb scope (`read:`, `create:`, `update:WebhookSubscription`).
- **Shared `$ref`s** — parameters (`PageParam`, `PageSizeParam`, `IdPathParam`), standard responses (401/403/404/409/422), and the `Location` header all resolve into `openapi.root.yaml`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — hard `$ref` dependency: this spec pulls common parameters, error responses, and the `Location` header from the root file. Changes to shared parameter names or response shapes in the root will break this module's spec.
- **`src/modules/webhooks/rules.yaml`** — sibling in the same module; the per-operation security scopes (`read:WebhookSubscription`, `create:WebhookSubscription`, `update:WebhookSubscription`) and the `x-read-rule` enforcement described in the operation notes are the authorization model that `rules.yaml` implements. The spec is the "what"; `rules.yaml` is the "who may" that the runtime enforces.

## Notes

- **Secret is shown exactly once.** The plaintext ring secret appears only in the `201` of `POST /subscriptions` (or the dedicated rotate/drop action). No read or list endpoint ever returns it.
- **SSRF check is at write-time *and* delivery-time.** `url` is resolved and rejected at creation/update *and* re-checked on every delivery because DNS can change post-creation. The 422 body names the `url` field but deliberately omits which internal address was hit.
- **`x-versioned` is a bundler directive, not a runtime feature.** The spec author does not manually add `ETag`/`If-Match`; the build tooling reads this hint and injects them. Adding a method to the array is the way to opt it in.
- **`autoDisabled` filter semantics:** `true` = disabled by the failure guard (`autoDisabledAt` set); `false` = everything else (enabled *or* manually paused). Combine with `enabled=false` to isolate manual pauses.
- **PUT clears omitted fields.** An omitted `description` in a `PUT` body is set to null (full-replace semantics), unlike `PATCH`.
- The file is truncated in the snapshot; the remaining operations (delete, secrets rotation, enable/disable, event catalogue, delivery log, replay) follow the same conventions and `$ref` pattern.
