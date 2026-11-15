---
source: src/modules/webhooks/services/subscriptions.ts
sha256: b7d64a833187d4010a2c6e7396936ea8f770435d93b3b93f218be9033a6baea1
generated_at: 2026-11-14T22:48:26.345506+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/subscriptions.ts

## Purpose

Implements the tenant-scoped CRUD service for webhook subscriptions: list, get-by-id, create (minting the secret ring's first secret), and the validation/authorization pipeline that guards each write (SSRF check, event-type catalogue check, caller read-permission check, subscription cap enforcement with race-safe rollback).

## Key elements

- **`SubscriptionWithMintedSecrets`** (interface) — response envelope carrying the subscription document plus the one-time plaintext secret (`secret` on create, `newSecret` on `createSecret`).
- **`SubscriptionListFilters`** (interface) — query-parameter shape accepted by `list` (enabled, autoDisabled, sort, page, pageSize).
- **`list`** — paginated search narrowed to the caller's tenant; maps each row through `withSubscriptionActions` to attach caller-specific action hints; remaps `enabled` to the repository's `disabled` presence filter.
- **`getById`** — fetches a single subscription within the tenant; returns `undefined` for both unknown IDs and other-tenant IDs (indistinguishable by design).
- **`create`** — validates event types (catalogue + read-permission), checks the subscription cap, runs the SSRF guard on the URL, mints the first ring secret, inserts the row, then calls `finalizeCreate`.
- **`refuseUnsafeUrl`** (internal) — resolves the outbound target via `resolveSafeOutboundTarget` with a 5 s timeout; on any failure returns a 422 on the `url` field and logs the reason server-side only.
- **`refuseUnknownEvents`** (internal) — rejects event names not present in the catalogue (422 on `eventTypes`).
- **`refuseUnreadableEvents`** (internal) — rejects event names the caller lacks read permission for (403 `WEBHOOK_EVENT_READ_REQUIRED`).
- **`insertionRank` / `rollbackOverCap` / `finalizeCreate`** (internal) — post-insert race guard: counts rows at-or-before the new `_id` within the tenant; if the rank exceeds the cap, deletes the row and returns 409; otherwise records an audit event and returns 201 with the plaintext secret.
- **`rejectLimitReached`** (internal) — builds the shared 409 `WEBHOOK_SUBSCRIPTION_LIMIT_REACHED` response.

## Relationships

- **src/modules/webhooks/secrets.ts** — `mintRingSecret` mints the first secret entry on create; `liveRingEntries` and `removeRingSecret` support the secret-ring actions (used in the truncated update/remove path).
- **src/modules/webhooks/config.ts** — `getWebhookSubscriptionCap` supplies the per-tenant subscription limit checked both pre-insert and post-insert.
- **src/modules/webhooks/repository.ts** — `webhookSubscriptionRepository` provides `search`, `findByIdInTenant`, `count`, `deleteOne`, and the insert path used by `create`.
- **src/modules/webhooks/model.ts** — `WebhookSubscriptionDocument` is the Mongoose document type threaded through all functions.
- **src/modules/webhooks/audit.ts** — `webhooksAuditActions` names the audit action recorded on successful create.
- **src/modules/webhooks/services/actions.ts** — `standingOn`, `viewSubscription`, `withSubscriptionActions` decorate responses with caller-specific action metadata.
- **src/infrastructure/adapters/ssrf-guard.ts** — `resolveSafeOutboundTarget` performs the input-time DNS/SSRF check; `SsrfRefusedError` is matched to extract a reason for logging.
- **src/infrastructure/http/response.ts** — `generateSuccess`, `generateReject`, `fieldError`, `ResponseSuccess`, `ResponseReject` build every return value.
- **src/infrastructure/i18n/index.ts** — `t` produces localized field and error messages (e.g. the `url-refused` and `subscription-cap-reached` keys).
- **src/infrastructure/observability/audit.ts** — `recordAudit` writes the audit trail on successful create.
- **src/infrastructure/observability/audit-changes.ts** — `auditChanges` imported (used in the truncated update/remove path).
- **src/infrastructure/persistence/create-repository.ts** — `PaginatedResult` type for `list`'s return.
- **src/infrastructure/persistence/changes.ts** — `clearedOrValue` helper (used in the truncated update path).
- **src/infrastructure/adapters/logger.ts** — `warn` method records the SSRF refusal reason server-side.

## Notes

- **Race-safe cap:** the cap is enforced twice — a `count` pre-insert rejects the common already-over case, and `insertionRank` (count of `_id ≤ newId`) post-insert catches concurrent creates. Only rows ranking within the cap survive; excess rows are deleted and the caller gets 409.
- **`async`/`await` in `finalizeCreate`:** deliberate deviation from the repo's usual promise-chain style. TypeScript's contextual typing of a `.then` callback narrows the union return incorrectly; `await` checks each `return` against the declared signature directly.
- **SSRF is checked twice:** at input time here (fail-fast for the operator) and again at delivery time (DNS can change between the two passes). The input-time check never exposes the resolved address to the caller.
- **Tenant scoping is structural:** every repository call passes `context.caller.tenantId`; the module never operates cross-tenant. `Caller.tenantId` is null only in platform scope, which `webhooks.*` keys never grant.
- **Event-filter validation is layered:** unknown-event check (catalogue) → unreadable-event check (caller's read rules). A filter naming an event the caller cannot read gets 403, not 422, because the caller *could* read it if they had the right.
