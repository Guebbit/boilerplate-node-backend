---
source: src/modules/example/services/crud.ts
sha256: 7714c81b60ea545dccfba51f885d70584ffd5e1cf29c362315ec61807c490a79
generated_at: 2026-10-29T03:55:43.089258+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/services/crud.ts

## Purpose

Service layer for the `example` entity's five CRUD operations (create, read, search, update, delete). It is the single door controllers and sibling modules call into: it applies domain rules, issues repository calls, and fires side-effects (audit, metrics, i18n, image cleanup). Status transitions are explicitly out of scope here and live in `./transition.ts`.

## Key elements

- **`create`** (exported) — Creates a draft example owned by the caller. Enforces auth (401 if no caller id), body-length ceiling, then delegates to the repository. Emits the `exampleCreatedTotal` metric and an audit record.
- **`getById`** (exported) — Fetches one example scoped to the caller. Falls back to a public read (any published row) if the scoped lookup misses. Applies per-field translations.
- **`search`** (exported) — Paginated, caller-scoped search. Resolves owner display-names, attaches per-row actions, and applies translations to the result set.
- **`updateById`** (exported) — PUT/PATCH entry point. Loads via the `update` scope, applies partial field changes (title/body only), audits the diff, and returns the saved row.
- **`removeById`** (exported) — Deletes via the `delete` scope, removes the associated cover image, and audits the deletion.
- **`scopeOf`** (internal) — Compiles the caller's authorization keys (per action) into a repository query fragment via `accessibleFilterFor`.
- **`bodyTooLong`** (internal) — Returns a 422 reject when the payload body exceeds the deployment-configured maximum.
- **`publishedById`** (internal) — Public read helper: fetches a row where `status = published`.
- **`translatedOne`** (internal) — Applies `applyTranslations` to a single example.
- **`applyUpdate`** (internal) — Performs the field assignments, captures an `auditChanges` diff, saves, and records the audit entry.
- **`deleteLoaded`** (internal) — Orchestrates row deletion → image removal → audit record.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@infrastructure/http/response` | `generateSuccess` / `generateReject` shape every return value. |
| `@infrastructure/i18n/index.ts` | `t()` localizes error messages (404, 422). |
| `@kernel/translation.ts` | `applyTranslations` overlays per-field translations on reads and search results. |
| `@infrastructure/observability/audit.ts` | `recordAudit` fires after every successful write. |
| `@infrastructure/observability/audit-changes.ts` | `auditChanges` captures the field-level diff before a save. |
| `@infrastructure/adapters/image-store.ts` | `imageStore.remove` deletes the cover image during `removeById`. |
| `@infrastructure/persistence/create-repository.ts` | `toObjectId` converts the caller's string id to an ObjectId in `create`. |
| `@infrastructure/persistence/search.ts` | `PaginatedMeta` type shapes the `search` return. |
| `@kernel/access/query.ts` | `accessibleFilterFor` builds the row-level filter from the caller's keys. |
| `../audit.ts` | `exampleAuditActions` enum values used in every `recordAudit` call. |
| `../config.ts` | `exampleConfig()` supplies the body-length ceiling. |
| `../domain/index.ts` | `fitsBodyLength` (validation) and `initialExampleStatus` (new-row status). |
| `../metrics.ts` | `exampleCreatedTotal` incremented on successful create. |

## Notes

- **Authorization is filter-based, not check-based.** An unauthorized row is indistinguishable from a missing one (404 / null), never a 403.
- **Status is never read or written here.** Any status mutation must go through `./transition.ts`, which has its own audit/event semantics.
- **`updateById` serves both PUT and PATCH.** Omitted fields are preserved; only the fields present in the validated body are assigned.
- **Body-length ceiling is deployment-tunable** via `exampleConfig().NODE_EXAMPLE_BODY_MAX_LENGTH` and may be stricter than the API contract's own limit.
- **`search` treats `status` as a scope fragment**, not a free-text field, because it is a closed enum.
