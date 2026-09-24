---
source: src/modules/webhooks/services/subscriptions.ts
sha256: ddd7a083589eb8cf306ef599756a76e8e55279d9a4bdecab517884c0376d2336
generated_at: 2026-09-23T19:43:08.373936+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/subscriptions.ts

## Purpose

Implements tenant-scoped CRUD for webhook subscriptions (list, create, update, remove). Handles secret-ring lifecycle (mint on create, rotate/remove on update), enforces a per-tenant subscription cap with race-safe two-phase checking, and emits audit records for every mutation.

## Key elements

- **`SubscriptionWithMintedSecrets`** — response shape pairing a `WebhookSubscriptionDocument` with an optional `secret` (create) or `newSecret` (rotate). Plaintext is shown exactly once and never retrievable afterwards.
- **`list(context, filters)`** — paginated, newest-first query of a tenant's subscriptions; optional `enabled` filter.
- **`insertionRank(subscriptionId, tenant)`** — counts rows at-or-before the given `_id` for the tenant; exploits Mongo ObjectId total ordering to assign a stable rank even under concurrent inserts.
- **`rollbackOverCap(subscription)`** — deletes the just-inserted row and returns a 422 reject.
- **`finalizeCreate(subscription, plaintext, tenant, context)`** — post-insert cap check via `insertionRank`; on pass, records audit and returns a 201 envelope.
- **`create(body, context)`** — pre-check tenant count → mint first ring secret → insert → `finalizeCreate`. The two-phase cap check (count-then-rank) ensures at most `cap` rows survive regardless of concurrent creates.
- **`update(id, body, context)`** — partial update of `url`/`description`/`eventTypes`/`enabled`, plus `rotateSecret` (push new ring entry) and `removeSecretId` (pop one, 422 if ring would empty). Re-enabling clears `disabledAt` and resets `consecutiveFailures`.
- **`remove(id, context)`** — deletes the subscription; delivery log rows are intentionally left in place.

## Relationships

- **`../repository.ts`** — all reads/writes go through `webhookSubscriptionRepository` (`search`, `count`, `create`, `findById`, `save`, `deleteOne`).
- **`../secrets.ts`** — `mintRingSecret()` produces the `{ entry, plaintext }` pair stored on the document; `removeRingSecret()` filters the ring array.
- **`../config.ts`** — `getWebhookSubscriptionCap()` supplies the per-tenant cap used by both the pre-check and the rank check.
- **`../audit.ts`** — `webhooksAuditActions` provides the action strings passed to `recordAudit`.
- **`../model.ts`** — `WebhookSubscriptionDocument` is the persistence shape used throughout.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` build every HTTP envelope.
- **`@infrastructure/i18n`** — `t()` localises all user-facing error messages.
- **`@infrastructure/observability/audit`** — `recordAudit` writes an audit entry on every successful mutation.
- **`@types`** — `TenantCallerContext` (guarantees `caller.tenantId` is set), plus request/response type aliases.
- **`@infrastructure/persistence/create-repository`** — `PaginatedResult` type for the list endpoint.
- **`../services/index.ts`** — barrel re-export for the webhooks services layer.

## Notes

- **Two-phase cap enforcement:** a plain `count` before insert handles the common case; the post-insert `insertionRank` closes the race where two callers both read a sub-cap count and both insert. Only rows whose rank ≤ cap survive; the rest are deleted and a 422 returned.
- **`async/await` in `finalizeCreate`:** deliberate deviation from the repo's usual `.then` chaining. TypeScript's contextual typing in a `.then` callback does not distribute over the `ResponseSuccess | ResponseReject` union and silently narrows to one branch; `await` checks each `return` against the declared type directly.
- **`ownerUserId` is a pointer, not an email.** The auto-disable notification resolves the recipient fresh at send time (`services/attempt.ts`); the field is `undefined` when the caller has no `id`.
- **Secrets are single-use plaintext.** The `secret` / `newSecret` fields on the response are the only moment the plaintext exists in application code; after that only the opaque `entry` lives in the document.
- **Tenant scoping is structural:** every query includes `tenant: context.caller.tenantId` in its scope; there is no path to cross-tenant reads because `TenantCallerContext` guarantees the field is non-null for any `webhooks.*` caller.
