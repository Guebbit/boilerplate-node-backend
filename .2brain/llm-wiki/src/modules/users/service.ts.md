---
source: src/modules/users/service.ts
sha256: 3b0369c54bbbf651660c66990a774cf3eafa4b103b8d803da31635f4f8b5b16c
generated_at: 2026-09-27T15:39:09.606063+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/service.ts

## Purpose

Admin-facing CRUD and search for the User document, plus the named identity operations (`account` calls for authenticate, register, verify, 2FA) and the inactivity reaper's read paths. This file enforces only what the user document itself requires; HTTP flows, sessions, emails, rate limits, and anti-automation live in `account`. It is the "users" end of the repo's shared-kernel relationship (`docs/theory/strategic-ddd.md` §5).

## Key elements

- **`validateData`** — Validates user data against the full `zodUserSchema` (not a `.pick()`) and returns UI-friendly `ResponseErrorItem[]`. Accepts `unknown` as the type-establishing boundary.
- **`search`** — Admin-panel user search; delegates to `userRepository.search`, returns `{ items: UserWire[], meta: PaginatedMeta }`.
- **`getById`** — Fetches a single user by ID; returns `undefined` when no ID is given.
- **`toUserContract`** (private) — Resolves a document's current role from the membership store and maps it through `toUser`, so controllers don't chain the two steps.
- **`enqueueIfPending`** — Enqueues the image digest worker when the document carries a `pendingImageKey`.
- **`nonBlankPassword`** (private) — Shared guard: is the password field present and non-whitespace? Used by both `create` and `update`.
- **`create`** — Admin user creation (no self-service email confirmation). Enforces the password-or-setup-email rule, checks breached passwords, generates a random 32-byte fallback, assigns the role via `assignRole` (compensating delete on failure), then fires audit, analytics, and optional `USER_SETUP_REQUESTED` event.
- **`update`** — Admin user update; follows the same result-envelope protocol. (Body truncated in the source snapshot.)

## Relationships

- **`@infrastructure/http/response`** — Consumes `generateSuccess`, `generateReject`, `validationErrors`, and the `ResponseSuccess`/`ResponseReject`/`ResponseErrorItem` types for its envelope protocol.
- **`@infrastructure/i18n`** — Calls `t()` for user-facing error messages (e.g. `users.field-password-or-setup-required`).
- **`@infrastructure/security/breached-passwords`** — Calls `assertPasswordNotBreached` on operator-supplied passwords before persisting.
- **`@infrastructure/security/pii-encryption`** — Imports `encryptPii` (used in the truncated portion for PII field handling).
- **`@infrastructure/adapters/image-store`** — Uses `imageStore` / `applyImageWriteback` for avatar image persistence.
- **`@infrastructure/adapters/image.worker`** — Calls `enqueueIfImagePending` to schedule post-write image processing.
- **`@infrastructure/persistence/changes`** — Uses `clearedOrValue` for partial-update field semantics.
- **`@infrastructure/persistence/search`** — Imports the `PaginatedMeta` type for search results.
- **`@infrastructure/runtime/database`** — Uses `withTransaction` for multi-write atomicity.
- **`@infrastructure/observability/audit`** — Calls `recordAudit` with actions from `usersAuditActions`.
- **`@infrastructure/observability/analytics`** — Calls `emitAnalyticsEvent` / `buildAnalyticsBase` with events from `usersAnalyticsEvents`.
- **`@kernel/access/tenant`** — Imports `DEPLOYMENT_TENANT_ID` to scope role assignments and role lookups.
- **`scripts/ops/reap-inactive-accounts.ts`** — The module doc's "third region" (inactivity reaper reads) is the consumer that this file's reads serve.

## Notes

- **Result envelopes, not throws.** Every mutation returns `ResponseSuccess | ResponseReject`; callers check `.success` rather than catching. This is a file-wide protocol.
- **Full-schema validation, not `.pick()`.** `validateData` validates the entire `zodUserSchema` so that wrong-typed `admin`/`active`/`imageUrl` values get a 422 instead of leaking to Mongoose and surfacing as a 500. The `.strip()` is applied only here (to tolerate `id` in PUT bodies) while the base schema stays strict for `account`'s callers.
- **Password fallback is 32 random hex bytes.** Neither the generated value nor its absence is a 422; the account is simply unusable until a real password is set. Breach-checking is skipped for the generated value.
- **`verifiedAt` is hardcoded to `now`** for admin-created users — the operator typing the address in is considered the vouching.
- **Role assignment is post-creation with compensating delete.** If `assignRole` rejects, the already-written document is deleted and the error re-thrown. This is deliberate: validating ahead would skip the audit trail that `assignRole` produces for the refusal itself.
- **Typed off `CreateUserRequest` / `UpdateUserByIdRequest`, not hand-picked `Pick`.** A previous hand-copied list silently dropped `active` from `update`, causing `USER_DEACTIVATED` to fire without the field ever being written.
