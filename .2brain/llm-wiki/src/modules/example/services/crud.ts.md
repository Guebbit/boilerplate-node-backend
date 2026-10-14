---
source: src/modules/example/services/crud.ts
sha256: 73c60f354cdca8a1b1687f24276cf479511ce202e35271a8b2c6081800e15133
generated_at: 2026-10-14T15:45:22.732687+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/crud.ts

## Purpose

The single CRUD service door for the Example module. Controllers and sibling modules call its exports (`create`, `getById`, `getPublishedById`, `search`, `update`) rather than the repository directly. It applies domain rules (status transitions, body length), enforces row-level access by compiling the caller's authorization keys into query filters, persists via the repository, and announces side effects (audit log, analytics event, outbox domain event).

## Key elements

- **`create`** – Inserts a draft owned by the caller; audits, increments a created-counter, returns 201.
- **`getById`** – Scoped read; returns `null` when no visible row matches.
- **`getPublishedById`** – Public read constrained to `status: published`; a draft is indistinguishable from a missing id.
- **`search`** – Paginated scoped search; resolves owner display names in a follow-up lookup before presenting rows.
- **`update`** – Shared PUT/PATCH entry. Checks body length, loads via scope filter, applies the outrank rule, then delegates to `applyUpdate`.
- **`applyUpdate`** *(internal)* – Validates the status transition, mutates the in-memory document, stamps `publishedAt` when appropriate, saves, and audits. If the move is into `published`, routes through `publishAndAnnounce`.
- **`publishAndAnnounce`** *(internal)* – Calls `exampleRepository.publishFrom` (optimistic "status still equals `before`") inside `announceInTransaction`, then emits the publish analytics event.
- **`deleteLoaded`** *(internal)* – Deletes the row and its cover image (`imageStore.remove`), then audits.
- **`scopeOf`** *(internal)* – Thin wrapper over `accessibleFilterFor` for a given action (`read`/`update`/`delete`).
- **`bodyTooLong`** *(internal)* – Returns a 422 `ResponseReject` when the body exceeds the deployment's `NODE_EXAMPLE_BODY_MAX_LENGTH`.
- **`analysePublished`** *(internal)* – Fires an `EXAMPLE_PUBLISHED` analytics event.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@kernel/access/query` | `accessibleFilterFor` compiles the caller's keys into the row-level filter used by every read/update/delete. |
| `@kernel/outbox` | `announceInTransaction` wraps the publish write so the domain event lands atomically. |
| `@infrastructure/http/response` | `generateSuccess` / `generateReject` shape every API response. |
| `@infrastructure/i18n` | `t` localises error and success messages. |
| `@infrastructure/observability/audit` | `recordAudit` logs create / update / delete outcomes. |
| `@infrastructure/observability/analytics` | `emitAnalyticsEvent` + `buildAnalyticsBase` for the publish metric. |
| `@infrastructure/adapters/image-store` | `imageStore.remove` deletes the cover image on `deleteLoaded`. |
| `@infrastructure/persistence/create-repository` | `toObjectId` for the caller's id at create time. |
| `@infrastructure/persistence/search` | `PaginatedMeta` type for search results. |
| `../domain` | `canTransition`, `fitsBodyLength`, `initialExampleStatus`, `isPublished`, `shouldStampPublishedAt` – the business rules the service enforces. |
| `../audit` | `exampleAuditActions` – the audit action constants. |
| `../analytics` | `exampleAnalyticsEvents` – the analytics event names. |
| `../config` | `exampleConfig()` exposes the deployment-specific body ceiling. |
| `../repository` | `exampleRepository` – all persistence calls (create, findScoped, search, save, publishFrom, deleteOne). |
| `../presenter` | `presentExampleRow` / `presentWithOwner` shape documents into the API contract. |
| `./owner` | `outrankedRefusalFor`, `ownerNamesOf` – rank-rule check and owner-name batch lookup. |

## Notes

- **404-as-403**: Because access is enforced by narrowing the query (not by a post-fetch check), a row the caller cannot see simply does not exist. Controllers get 404, not 403, for out-of-scope ids.
- **Publish race**: `publishFrom` carries a `before` status in the `where` clause. If a peer moved the status first, the write affects 0 rows; `applyUpdate` then re-reads and retries once. The loser's announcement is skipped.
- **Status in search**: `filters.status` is merged into the *scope* (query filter), not passed as a free-text search field, because the status is a closed enum.
- **Body ceiling is deployment-specific**: `exampleConfig().NODE_EXAMPLE_BODY_MAX_LENGTH` can be set below the API contract's own limit, so a body valid per the contract can still be rejected.
- **`deleteLoaded` is not exported**: deletion is reached through a higher-level flow that first loads and scope-checks the document; this file only exposes `create`, `getById`, `getPublishedById`, `search`, and `update`.
