---
source: src/modules/webhooks/services/subscriptions.ts
sha256: bca5bd97a2b9e4e8df58f7979db1099c9921b97d0cbd26dbede69e101bf2fee3
generated_at: 2026-11-08T09:07:20.517758+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/subscriptions.ts

## Purpose

CRUD service layer for webhook subscriptions: list, get, create, update, enable/disable, secret-ring management, and remove. All operations are tenant-scoped via `context.caller.tenantId`. The file also enforces a per-tenant subscription cap (with a race-safe post-insert check), validates outbound URLs against SSRF at input time, and rejects unknown event types before they become dead subscriptions.

## Key elements

- **`SubscriptionWithMintedSecrets`** – Response envelope pairing a subscription document with a one-time plaintext secret (`secret` on create, `newSecret` on `createSecret`).
- **`refuseUnsafeUrl(url)`** – Calls the SSRF guard with a 5 s timeout; returns a 422 `fieldError('url', …)` on refusal. Logs the real reason server-side but exposes only "refused" to the caller.
- **`refuseUnknownEvents(eventTypes?)`** – Cross-checks names against the catalogue (`unknownEventTypes`); returns a 422 listing unknown names, or `undefined` when valid.
- **`SubscriptionListFilters`** – Query-parameter shape for `GET /webhooks/subscriptions` (enabled, autoDisabled, sort, page, pageSize).
- **`list(context, filters)`** – Paginated search; inverts `enabled` → `disabled` for the repository; decorates each row with caller-specific `actions`.
- **`getById(id, context)`** – Fetches one subscription within the tenant; returns `undefined` (not 404) for foreign ids.
- **`insertionRank(subId, tenant)`** – Counts rows with `_id ≤ subId` to derive a stable insertion rank (ObjectId ordering).
- **`rollbackOverCap(subscription)`** – Deletes a just-inserted row and returns the 409.
- **`finalizeCreate(sub, plaintext, tenant, ctx)`** – Post-insert cap check via rank; audits on success; returns 201 + secret or 409.
- **`create(body, ctx)`** – Validates events → pre-count cap → SSRF URL check → mints first ring secret → inserts → `finalizeCreate`.
- **`AUDITED_FIELDS`** – Declares which update fields are recorded by value (`eventTypes`) vs. by name only (`url`, `description`).
- **`update`, `enable`, `disable`, `createSecret`, `removeSecret`, `remove`** – Remaining CRUD and action endpoints (truncated in source but referenced throughout).

## Relationships

- **`../repository.ts`** – Primary data access: `search`, `findByIdInTenant`, `count`, `create`, `deleteOne`.
- **`../secrets.ts`** – `mintRingSecret`, `removeRingSecret`, `liveRingEntries` for secret-ring lifecycle.
- **`../config.ts`** – `getWebhookSubscriptionCap()` for the per-tenant limit.
- **`../audit.ts`** – `webhooksAuditActions` enum used in `recordAudit` calls.
- **`@infrastructure/observability/audit.ts` / `audit-changes.ts`** – `recordAudit` (create) and `auditChanges` (update field diffs).
- **`@infrastructure/adapters/ssrf-guard.ts`** – `resolveSafeOutboundTarget`, `SsrfRefusedError` for input-time URL validation.
- **`@infrastructure/http/response.ts`** – `generateSuccess`, `generateReject`, `fieldError` for response envelopes.
- **`@infrastructure/i18n/index.ts`** – `t()` for translated error/success messages.
- **`@infrastructure/adapters/logger.ts`** – Structured warning on SSRF refusal (reason + detail stay server-side).
- **`@infrastructure/persistence/create-repository.ts`** – `PaginatedResult` return type.
- **`@infrastructure/persistence/changes.ts`** – `clearedOrValue` helper for diffing updated fields.
- **`./actions.ts`** – `standingOn`, `viewSubscription`, `withSubscriptionActions` for caller-specific action decoration.

## Notes

- **Cap is enforced twice.** A pre-insert `count` rejects the common case without writing; `insertionRank` after insert closes the TOCTOU race (two concurrent creates both pass the pre-count, but only `cap` rows can rank within the limit). The losing row is deleted via `rollbackOverCap`.
- **`finalizeCreate` uses `async/await` deliberately.** A `.then` callback would let TypeScript's contextual typing silently narrow the union return to one branch; `await` checks each `return` against the full declared type.
- **`enabled` → `disabled` inversion.** The stored field is `disabledAt`; the list filter `enabled: true` is mapped to `disabled: false` before reaching the repository.
- **SSRF input check is advisory.** The authoritative check happens at delivery time (DNS can change). The input check exists to fail fast and give the operator immediate feedback.
- **Caller sees only "URL refused" (422).** The specific reason (internal IP, blocked range, timeout) is logged server-side but never returned—preventing network topology enumeration.
- **`ownerUserId` is a pointer, not an email.** Stores `context.caller.id` if present; never free-text PII.
- **Update never touches the secret ring or enabled state.** Those are separate actions (`createSecret`/`removeSecret`, `enable`/`disable`).
