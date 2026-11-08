---
source: src/modules/users/services/read.ts
sha256: c7e8acfa21acf363d81599eefc6347555b877d173667410e06f75fcdfdfb9684
generated_at: 2026-11-08T08:51:04.549112+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/read.ts

## Purpose

Admin-facing read operations for the user domain: searching, single-document fetches, batch/single resolution of a user's live role + permitted actions into the public `User` contract, and a helper to collect eligible staff contacts for outbound notifications. It sits between the repository (raw documents) and the API layer (serialisable DTOs), adding the role/action logic that a raw `UserDocument` lacks.

## Key elements

- **`search(filters?)`** — Searches users via `userRepository.search`, injecting a dynamic MongoDB scope for the temporal `purchaseHold` filter. Returns `{ items: UserWire[], meta: PaginatedMeta }`.
- **`getById(id?)`** — Fetches a single `UserDocument` by id; resolves to `undefined` when id is falsy or not found.
- **`findByEmail(email)`** — Looks up a user by email *with credentials included* (bypasses the usual `select: false`). Used by reset/setup flows that immediately attach a token.
- **`staffContacts(ids)`** — Narrows a list of account ids to live, enabled, authenticator-armed staff members, returning `{ id, email, locale }[]` with a locale fallback via `getDefaultLocale()`.
- **`toUserContract(user, caller)`** — Resolves a single already-loaded `UserDocument`'s current role (via `accessService.rolesOf`) and staff status, then delegates to `presentUser` with `userActionsFor` to produce the public `User` shape.
- **`toUserContracts(rows, caller)`** — Batch counterpart: resolves roles for all ids in **one** `rolesOfMany` query and staff membership in **one** `staffHoldersAmong` query, then maps each `UserWire` row through `presentUser`.
- **`StaffContact`** — Exported interface: `{ id, email, locale }` for notification targets.
- **`searchScopeOf`** *(internal)* — Builds the MongoDB scope object from `purchaseHold` / `purchaseHoldReview` filters; returns `undefined` when neither is set.

## Relationships

- **`../repository`** (`userRepository`) — All data access (search, findById, findStaffContacts, findOneWithCredentials) delegates here.
- **`../presenter`** (`presentUser`) — Shaping raw documents into the public `User`/`UserWire` contract.
- **`../model`** — Type definitions `UserDocument`, `UserWire` consumed throughout.
- **`./actions`** (`userActionsFor`) — Computes the per-caller action list passed into the presenter.
- **`@modules/access`** (`accessService`) — Role resolution (`rolesOf`, `rolesOfMany`) and staff-membership check (`staffHoldersAmong`).
- **`@kernel/access/tenant`** (`DEPLOYMENT_TENANT_ID`) — Tenant scoping for every `accessService` call.
- **`@infrastructure/i18n`** (`getDefaultLocale`) — Locale fallback in `staffContacts`.
- **`@infrastructure/persistence/search`** — `PaginatedMeta` type for the search response.
- **`@types`** — `Caller`, `SearchUsersRequest`, `User` type imports.
- **`./index`** — This module's exports are re-exported through the users services barrel.

## Notes

- `purchaseHold: true` is a **temporal** question (`until > now`), so it cannot be a plain column filter; it is injected as a scope argument to the repository search. `purchaseHoldReview` is a simple existence check and combines additively.
- `active` is an ordinary searchable boolean column (handled by the repository's `searchable.booleans`) and is **independent** of `deletedAt`.
- `findByEmail` deliberately includes credential fields because callers immediately `push` a token onto the document; a `select: false` projection would leave the field `undefined`.
- `staffContacts` **silently drops** ineligible users (no error, no partial result) — the caller must treat the returned list as the complete set of reachable staff.
- `toUserContracts` avoids N+1 by batching into exactly two additional queries regardless of page size.
