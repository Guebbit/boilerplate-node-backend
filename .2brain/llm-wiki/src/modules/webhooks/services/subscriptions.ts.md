---
source: src/modules/webhooks/services/subscriptions.ts
sha256: 29e9ad6a99268d1d8d024b060d0dd8a12a3361e8fa1821bd0c70fb5ed280720a
generated_at: 2026-10-29T06:30:51.347602+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/subscriptions.ts

## Purpose

Tenant-scoped CRUD service for webhook subscriptions: list, get, create, update, enable/disable, secret-ring management, and delete. Enforces per-tenant subscription caps, validates outbound URLs against SSRF at subscription time, and validates event-type filters against the catalogue. Exists as the single write path for subscription lifecycle so that cap enforcement, secret minting, and audit logging stay consistent across every mutation.

## Key elements

- **`SubscriptionWithMintedSecrets`** — envelope pairing a subscription doc with a one-time plaintext secret (set on `create` or `createSecret` only).
- **`SubscriptionListFilters`** — query-parameter shape for the list endpoint (`enabled`, `autoDisabled`, `sort`, `page`, `pageSize`).
- **`list`** — paginated search scoped to the caller's tenant; remaps `enabled` → repository's `disabled` presence filter; attaches per-row `actions` via `withSubscriptionActions`.
- **`getById`** — single-tenant lookup; returns `undefined` for foreign-tenant or unknown ids (indistinguishable by design).
- **`create`** — validates event types, checks cap (pre-count), validates URL via SSRF guard, mints the ring's first secret, inserts, then re-checks cap by `_id` rank to close the insert race; rolls back and returns 409 if over cap.
- **`refuseUnsafeUrl`** (internal) — calls `resolveSafeOutboundTarget` with a 5 s timeout; on refusal logs the reason server-side but returns only a generic "url refused" 422 to the caller.
- **`refuseUnknownEvents`** (internal) — 422 if any requested event type is absent from the catalogue.
- **`insertionRank`** (internal) — counts rows with `_id ≤` the new row's id within the tenant; stable total order via Mongo ObjectId.
- **`rollbackOverCap`** / **`finalizeCreate`** (internal) — post-insert cap enforcement and success path (audit + 201 response).
- **`AUDITED_FIELDS`** (internal) — declares which update fields are audited by value (`eventTypes`) vs. by name only (`url`, `description`).

## Relationships

- **`webhooks/secrets.ts`** — imports `mintRingSecret` (create), `liveRingEntries` (view/enable), `removeRingSecret` (removeSecret action).
- **`webhooks/repository.ts`** — all reads/writes go through `webhookSubscriptionRepository` (search, findByIdInTenant, count, create, deleteOne, update).
- **`webhooks/actions.ts`** — `standingOn`, `viewSubscription`, `withSubscriptionActions` provide the per-caller action set attached to returned docs.
- **`webhooks/config.ts`** — `getWebhookSubscriptionCap` supplies the per-tenant limit.
- **`webhooks/audit.ts`** — `webhooksAuditActions` supplies action identifiers passed to `recordAudit`.
- **`webhooks/model.ts`** — `WebhookSubscriptionDocument` is the Mongoose document type used throughout.
- **`infrastructure/adapters/ssrf-guard.ts`** — `resolveSafeOutboundTarget` + `SsrfRefusedError` gate URL validation at subscription time.
- **`infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` / `fieldError` shape every API response.
- **`infrastructure/i18n/index.ts`** — `t()` localizes all user-facing error messages.
- **`infrastructure/adapters/logger.ts`** — `logger.warn` records SSRF refusal reason server-side.
- **`infrastructure/observability/audit.ts`** — `recordAudit` logs creation events.
- **`infrastructure/observability/audit-changes.ts`** — `auditChanges` records field-level diffs on updates.
- **`infrastructure/persistence/changes.ts`** — `clearedOrValue` helps normalize nullable update fields for change tracking.
- **`infrastructure/persistence/create-repository.ts`** — provides the `PaginatedResult` return type for list queries.

## Notes

- **Cap race guard is two-phase.** A `count` before insert rejects the common case without writing; `insertionRank` after insert closes the true race. `_id` (Mongo ObjectId) gives a stable total order, so exactly `cap` rows survive regardless of concurrent creates.
- **`finalizeCreate` uses `async/await` deliberately**, not `.then()`. TypeScript's contextual return-type narrowing over the `ResponseSuccess | ResponseReject` union fails in a `.then` callback (silently picks one branch); `await` checks each `return` against the declared type directly.
- **SSRF refusal is opaque to the caller.** The server log records `reason` and `detail`; the API response only says the URL was refused. A timeout is treated the same as an SSRF refusal (target unverified → refused).
- **The plaintext secret is shown exactly once** — in the 201 response of `create` or the response of `createSecret`. It is never retrievable afterward.
- **URL and description are audited by name only** (not by value) because a receiver URL can embed tokens and the description is free-form.
- **`ownerUserId`** stores the caller's id as a pointer; it is never set to an email or other PII.
