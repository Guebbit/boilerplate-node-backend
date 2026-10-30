---
source: src/modules/users/services/read.ts
sha256: c7e8acfa21acf363d81599eefc6347555b877d173667410e06f75fcdfdfb9684
generated_at: 2026-10-29T06:17:52.092637+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/read.ts

## Purpose
Read-side service for the users module. Exposes admin search, single-document retrieval, staff-contact resolution for notifications, and the conversion of persisted user documents into the API `User` contract (role + permitted actions). It sits between the repository/persistence layer and the HTTP handlers, keeping write-mutation logic in `actions.ts`.

## Key elements
- **`search(filters?)`** — Paginated user search for the admin panel. Delegates to `userRepository.search`, injecting a derived scope (see below). Returns `{ items: UserWire[], meta: PaginatedMeta }`.
- **`searchScopeOf(filters)`** *(private)* — Builds a MongoDB scope object for `purchaseHold` (must be unexpired *now*) and `purchaseHoldReview` (flag present), or `undefined` if neither is set.
- **`getById(id?)`** — Fetches one `UserDocument` by id; resolves to `undefined` when id is falsy or not found.
- **`staffContacts(ids)`** — Narrows a list of account ids to those who are live, enabled, and have an authenticator app, returning `{ id, email, locale }` tuples for notification dispatch.
- **`toUserContract(user, caller)`** — Resolves a single `UserDocument` into the `User` API contract: fresh role lookup via `accessService.rolesOf`, staff-role check, and `userActionsFor`.
- **`toUserContracts(rows, caller)`** — Batch counterpart for a page of `UserWire` rows. Uses `rolesOfMany` + `staffHoldersAmong` (two queries) to avoid per-row lookups.
- **`findByEmail(email)`** — Finds a user by email, **including credentials**, returning `UserDocument | undefined | null`.
- **`StaffContact`** — Exported interface: `{ id, email, locale }`.

## Relationships
- **`@modules/users/repository`** — Primary data source; calls `search`, `findById`, `findStaffContacts`, `findOneWithCredentials`.
- **`@modules/users/presenter`** — `presentUser` shapes documents into wire/API contracts; called by both `toUserContract` and `toUserContracts`.
- **`@modules/users/services/actions`** — `userActionsFor` computes the caller-specific action set embedded in each `User` contract.
- **`@modules/access`** — `accessService.rolesOf` / `rolesOfMany` / `staffHoldersAmong` supply current role and staff-holder data.
- **`@kernel/access/tenant`** — `DEPLOYMENT_TENANT_ID` scopes every role lookup to the deployment tenant.
- **`@infrastructure/i18n`** — `getDefaultLocale` fills in a locale fallback in `staffContacts`.
- **`@types`** — `Caller`, `SearchUsersRequest`, `User` types consumed across the module.
- **`@infrastructure/persistence/search`** — `PaginatedMeta` type for the search response envelope.
- **`@modules/notifications/services/{digest,staff}`** — Upstream consumers of `staffContacts` (noted in its docstring as the recipient list for notices).

## Notes
- `purchaseHold: true` is a **point-in-time** question (hold not yet expired), so it is encoded as a `scope` clause (`$gt: new Date()`) rather than a stored-column filter. `purchaseHoldReview` is the opposite: it asks whether the *flag* persists regardless of hold expiry. Both can combine in one scope.
- `active` is intentionally **not** part of the scope; it is a plain searchable boolean handled by the repository's `searchable.booleans`, independent of `deletedAt`.
- `findByEmail` deliberately bypasses the repository's default `select: false` for credentials because the immediate callers (reset-request, setup-request) write a token onto the returned document.
- `toUserContracts` takes `UserWire[]` (the lean rows `search` already produces), not `UserDocument[]`, to avoid re-mapping.
- `staffContacts` **silently drops** any id that fails the live/enabled/authenticator checks — callers should not expect a 1:1 mapping back to the input list.
