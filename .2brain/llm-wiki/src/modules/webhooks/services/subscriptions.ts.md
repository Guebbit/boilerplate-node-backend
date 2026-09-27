---
source: src/modules/webhooks/services/subscriptions.ts
sha256: 9405bc13fdee814508912c4c44871e91f8eb4d0bbc27598201e427fa0511b1b7
generated_at: 2026-09-27T15:44:50.671240+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/subscriptions.ts

## Purpose

Tenant-scoped CRUD and secret-ring management for webhook subscriptions. Handles listing, creation (with a race-safe per-tenant cap), state updates, secret rotation/removal, and deletion. The secret ring is the core abstraction: each subscription carries one or more signing secrets, and the plaintext is returned exactly once at creation or rotation time.

## Key elements

- **`SubscriptionWithMintedSecrets`** — interface pairing a `WebhookSubscriptionDocument` with an optional one-time plaintext (`secret` on create, `newSecret` on rotate).
- **`list`** — paginated, newest-first query of a tenant's subscriptions; supports an `enabled` filter. No free-text search (repository has no `searchable` spec).
- **`create`** — enforces the per-tenant cap twice (pre-insert `count`, post-insert `insertionRank`) to survive concurrent creates. Mints the ring's first secret via `mintRingSecret`, stores only the encrypted entry, returns the plaintext once.
- **`update`** — mutates `url`, `description`, `eventTypes`, `enabled`. Only a disabled→enabled transition resets `consecutiveFailures` and clears `disabledAt` (re-arm). The secret ring is untouched here.
- **`rotateSecret`** — appends a new secret entry to the ring; returns the new plaintext alongside the saved document.
- **`removeSecret`** — removes one ring entry by id. Returns 404 if the id isn't in the ring; 422 if removal would empty the ring.
- **`insertionRank`** *(internal)* — counts all rows for the tenant with `_id` ≤ the given id, giving a stable ordinal that resolves concurrent-insert races.
- **`rollbackOverCap`** *(internal)* — deletes a just-inserted row and returns a 422 reject.
- **`finalizeCreate`** *(internal)* — ranks the new row; if over cap, rolls back; otherwise records an audit event and returns the 201 envelope.

## Relationships

- **`../repository.ts`** — all persistence goes through `webhookSubscriptionRepository` (search, count, create, findByIdInTenant, save, deleteOne).
- **`../secrets.ts`** — `mintRingSecret` produces the `{ entry, plaintext }` pair; `removeRingSecret` filters an entry out of the ring.
- **`../config.ts`** — `getWebhookSubscriptionCap()` supplies the per-tenant subscription limit.
- **`../audit.ts`** — `webhooksAuditActions` provides the action-string constants passed to `recordAudit`.
- **`../model.ts`** — `WebhookSubscriptionDocument` is the persisted document shape used throughout.
- **`@infrastructure/http/response`** — all return values are `generateSuccess` / `generateReject` envelopes.
- **`@infrastructure/i18n`** — `t()` localizes every user-facing error message.
- **`@infrastructure/observability/audit`** — `recordAudit` is called after every successful mutation.
- **`@infrastructure/persistence/changes`** — `clearedOrValue` turns `null` into a `$unset` sentinel for optional fields.
- **`@infrastructure/persistence/create-repository`** — source of the `PaginatedResult` type used by `list`.
- **`../services/index.ts`** — barrel re-export of this module's public functions.
- **`src/modules/webhooks/tests/integration/subscriptions.test.ts`** — integration tests covering the CRUD and secret-ring flows.

## Notes

- **Race-safe cap**: two concurrent creates can both pass the pre-insert count check; the post-insert `insertionRank` + `rollbackOverCap` pair guarantees at most `cap` rows survive regardless of concurrency.
- **Plaintext is single-use**: the only responses carrying a secret in cleartext are `create` (201) and `rotateSecret` (200). All other reads return the encrypted entries only.
- **Re-arm is directional**: setting `enabled: true` on an already-enabled subscription does *not* reset the failure streak; only the disabled→enabled edge does.
- **`ownerUserId` is a reference, not an email**: it stores `context.caller.id` for later resolution at auto-disable notification time; it is intentionally nullable (pre-existing subscriptions have no owner).
- **`async/await` in `finalizeCreate`** is deliberate: TypeScript's contextual typing on `.then` callbacks mis-narrows the `ResponseSuccess | ResponseReject` union, whereas `await` checks each `return` against the declared signature.
- **Every read/write is tenant-scoped** via `context.caller.tenantId`; the module is unreachable without a `tenant`-scoped authorization key.
