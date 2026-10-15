---
source: src/modules/webhooks/services/subscriptions.ts
sha256: dd55a97fcb472de5e1a0a1b5556ced0337d03e72adbadf82175dc762aee40350
generated_at: 2026-10-15T12:22:27.694131+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/subscriptions.ts

## Purpose
Tenant-scoped CRUD service for webhook subscriptions. Provides list, create, update, remove, and secret-ring actions (`rotateSecret`/`removeSecret`). Enforces a per-tenant subscription cap with a race-safe double-check, pre-validates outbound URLs against SSRF, and validates event-type filters against the known catalogue before any write.

## Key elements
- **`SubscriptionWithMintedSecrets`** (exported interface) — pairs a `WebhookSubscriptionDocument` with the one-time plaintext secret just minted (set on `secret` for create, `newSecret` for rotate).
- **`list`** (exported) — paginated, newest-first listing scoped to `context.caller.tenantId`; optional `enabled` filter.
- **`create`** (exported) — validates event types, checks cap (count pre-check), SSRF-checks the URL, mints the first ring secret, inserts the row, then re-ranks against the cap and rolls back if over. Returns the plaintext secret exactly once.
- **`update`** (exported) — patches `url`, `description`, `eventTypes`, `enabled`. Never touches the secret ring. Only a disabled→enabled transition resets `consecutiveFailures` and clears `disabledAt`.
- **`rotateSecret` / `removeSecret`** (exported, in truncated portion) — add / delete a single ring entry via `../secrets`.
- **`refuseUnsafeUrl`** (internal) — calls `resolveSafeOutboundTarget` with a 5 s timeout; returns a 422 on refusal or timeout. Logs the full reason server-side but never exposes it to the caller.
- **`refuseUnknownEvents`** (internal) — checks requested `eventTypes` against the catalogue; 422 listing unknown names.
- **`insertionRank` / `rollbackOverCap` / `finalizeCreate`** (internal) — post-insert rank check that closes the create-vs-create race; `finalizeCreate` uses `async/await` (not `.then`) to avoid a TypeScript contextual-typing bug on the union return type.

## Relationships
| Neighbor | Interaction |
|---|---|
| `../repository.ts` | All reads/writes go through `webhookSubscriptionRepository` (`search`, `count`, `create`, `findByIdInTenant`, `save`, `deleteOne`). |
| `../secrets.ts` | `mintRingSecret`, `removeRingSecret`, `liveRingEntries` manage the per-subscription secret ring. |
| `../config.ts` | `getWebhookSubscriptionCap()` supplies the tenant's max subscription count. |
| `../audit.ts` | `webhooksAuditActions` provides the action constants passed to `recordAudit`. |
| `../model.ts` | `WebhookSubscriptionDocument` is the document shape this service reads/writes. |
| `services/catalogue.ts` | `unknownEventTypes` validates requested event names. |
| `services/index.ts` | Re-exports the public API of this file. |
| `@infrastructure/adapters/ssrf-guard.ts` | `resolveSafeOutboundTarget` + `SsrfRefusedError` for input-time URL safety. |
| `@infrastructure/adapters/logger.ts` | `logger.warn` on SSRF refusal (reason + detail, server-side only). |
| `@infrastructure/http/response.ts` | `generateSuccess`, `generateReject`, `fieldError` shape every HTTP response. |
| `@infrastructure/i18n/index.ts` | `t()` produces localized error/user-facing strings. |
| `@infrastructure/observability/audit.ts` | `recordAudit` on successful create/update. |
| `@infrastructure/persistence/changes.ts` | `clearedOrValue` maps `null` → `$unset` for nullable fields (description). |
| `@infrastructure/persistence/create-repository.ts` | `PaginatedResult` type for list responses. |

## Notes
- **Cap is enforced twice.** A `count` pre-check rejects the common over-cap case without writing; a post-insert `insertionRank` re-check closes the two-callers-simultaneously race. The losing insert is deleted and a 422 returned.
- **Plaintext secret is returned exactly once** (create or rotate) and never persisted. Downstream services must use the ring entries, not a stored copy.
- **`ownerUserId` is a pointer** (caller id), not a stored email. The auto-disable notice resolves the address at send time.
- **URL SSRF check is fail-fast only.** The delivery-time guard still runs because DNS can change after the input check passes.
- **`update` never mutates the secret ring.** Use `rotateSecret`/`removeSecret` for that.
- **`finalizeCreate` deliberately uses `async/await`** over promise chaining: TS's contextual typing of a `.then` callback narrows the union return incorrectly; `await` checks each `return` against the declared type.
- **`enabled: true` on an already-enabled row is a no-op** for the failure streak; only a false→true transition re-arms.
