---
source: src/modules/users/services/read.ts
sha256: ffa13a9ebf2f24c077889929dd48b08c1df071ca9fb2365e43c9893660cc0a48
generated_at: 2026-11-14T22:30:31.536703+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/read.ts

## Purpose

Admin-facing read operations for the user module: searching, fetching by ID or email, and projecting already-loaded user documents into the outward contract shapes (`User`, `UserListItem`, `StaffContact`). It sits between the repository (raw documents) and the HTTP layer (serialised responses), adding role resolution, permission-aware actions, and pagination.

## Key elements

- **`search(filters)`** — Returns a page of `UserWire` rows plus `PaginatedMeta`. Delegates to `userRepository.search`, passing a computed scope for the time-sensitive `purchaseHold` filter.
- **`getById(id?)`** — Single-document fetch by ID; resolves `undefined` when the id is absent.
- **`findByEmail(email)`** — Looks up a user by email, deliberately including credential fields so callers (reset/setup flows) can attach a token immediately.
- **`staffContacts(ids)`** — Narrows a list of account IDs to staff who are live, enabled, and have an authenticator armed; returns `{ id, email, locale }` tuples.
- **`toUserContract(user, caller)`** — Projects one loaded `UserDocument` into the full `User` contract: resolves current roles via `accessService`, computes `userActionsFor`, and hands both to `presentUser`.
- **`toUserListItems(rows, caller)`** — Batch-projects a page of `UserWire` rows into `UserListItem` shapes using two bulk queries (`rolesOfMany`, `staffHoldersAmong`) instead of per-row lookups.
- **`StaffContact`** (interface) — Minimal contact record (id, email, locale) consumed by notification/digest services.
- **`searchScopeOf`** (private) — Builds the MongoDB scope object for `purchaseHold` (date comparison) and `purchaseHoldReview` (flag existence) filters.

## Relationships

- **`src/modules/users/repository.ts`** — All data access (`search`, `findById`, `findOneWithCredentials`, `findStaffContacts`) goes through `userRepository`.
- **`src/modules/access/index.ts`** — `accessService` (imported from this barrel) provides `rolesOf`, `rolesOfMany`, and `staffHoldersAmong` used by the projection functions.
- **`src/kernel/access/tenant.ts`** — Supplies `DEPLOYMENT_TENANT_ID`, the tenant scope passed to every `accessService` call.
- **`src/modules/users/presenter.ts`** — `presentUser` and `presentUserListItem` turn documents + roles + actions into the final wire shapes.
- **`src/modules/users/services/actions.ts`** — `userActionsFor` computes the per-caller permission flags embedded in each projected row.
- **`src/modules/users/model.ts`** — Source of the `UserDocument` and `UserWire` type contracts.
- **`src/infrastructure/persistence/search.ts`** — Provides the `PaginatedMeta` type for the search response.
- **`src/infrastructure/i18n/index.ts`** — `getDefaultLocale` fallback in `staffContacts`.
- **`src/modules/notifications/services/staff.ts`** — Downstream consumer of `StaffContact` for routing notices.
- **`src/types/auth-context.ts`** — Source of the `Caller` type used in every projection function's signature.

## Notes

- `purchaseHold: true` is a *point-in-time* question (is the hold still active?), so it is expressed as a scope with `$gt: new Date()` rather than a stored-column filter. `purchaseHoldReview: true` is orthogonal — it asks whether the flag was ever set, regardless of the hold's expiry. The two combine via AND when both are present.
- `findByEmail` intentionally bypasses the repository's `select: false` credential exclusion. If callers start stripping credentials upstream, the token-push pattern in reset/setup flows will break silently.
- `toUserListItems` expects pre-loaded `UserWire` rows (the lean shape from `search`). Passing a full `UserDocument` will type-check but is unnecessary and carries extra fields into the presenter.
- `staffContacts` drops ineligible users silently (no error, no log). Callers that need to know *why* someone was excluded must inspect the document fields themselves.
