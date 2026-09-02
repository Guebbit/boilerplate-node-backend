# src/modules/users/service.ts

## Purpose

Admin-facing user CRUD and search service. Owns the operator-side lifecycle (create, read, update, soft/hard delete) for user documents, while the `account` module handles self-service auth (signup, login, password reset, tokens). Emits domain events, audit/analytics signals, and fire-and-forget image-digest jobs as side effects of each write.

## Key elements

- **`validateData(userData, requirePassword?)`** — Validates against the full `zodUserSchema` (or a password-optional variant) and returns UI-friendly `ResponseErrorItem[]`. Takes `unknown` as the type boundary.
- **`search(filters)`** — Thin delegation to `userRepository.search`; returns `{ items, meta }` with `PaginatedMeta`.
- **`getById(id?)`** — Returns a single user document or `undefined` when `id` is absent.
- **`enqueueIfPending(user)`** — Fire-and-forget (`void`) call to `enqueueImageDigest` when `user.pendingImageKey` is set. Caller must not await.
- **`create(data, context)`** — Admin user creation. `verified` is hardcoded `true`. Password is optional: if omitted, a 32-byte random hex fills the required field and (optionally) a `USER_SETUP_REQUESTED` domain event is emitted. Emits audit + analytics events.
- **`update(user, data)`** — Field-by-field assignment onto the document, then `userRepository.save`. Returns a `ResponseSuccess | ResponseReject` envelope (never throws). On `active: false`, chains a non-blocking `tokenRemoveAll(REFRESH)`.
- **`updateById(id, data, context)`** — Fetches with credentials (`findByIdWithCredentials`), delegates to `update`, then emits audit and (on deactivation) analytics events. Returns 404 envelope if not found.
- **`remove(user, hardDelete?)`** — Soft delete **flips** `deletedAt` (toggle: second call restores). Hard delete awaits `USER_DELETED` domain event before writing. Soft path also revokes refresh tokens.

## Relationships

- **`@infrastructure/adapters/image.worker.ts`** — Calls `enqueueImageDigest` in `enqueueIfPending`; passes `userRepository.writebackImage` as the writeback callback.
- **`@infrastructure/http/request.ts`** — Imports `CallerContext` type used in `create`/`updateById` for audit & analytics attribution.
- **`@infrastructure/http/response.ts`** — Uses `generateSuccess`, `generateReject`, `validationErrors`, and the `ResponseSuccess`/`ResponseReject` envelope types throughout.
- **`@infrastructure/i18n/index.ts`** — Imports `t` for localized 404 / delete messages.
- **`@infrastructure/observability/analytics/index.ts`** — Calls `emitAnalyticsEvent` + `buildAnalyticsBase` on create, deactivation.
- **`@infrastructure/observability/audit.ts`** — Calls `emitAuditEvent` + `buildAuditEvent` on create and update.
- **`@infrastructure/persistence/search.ts`** — Imports `PaginatedMeta` type for the `search` return shape.
- **`@kernel/events.ts`** — Calls `emitDomainEvent(USER_SETUP_REQUESTED, …)` in `create` and `emitDomainEvent(USER_DELETED, …)` before hard delete.
- **`src/modules/account/services/profile.ts`** — Calls `update` with `analyticsConsent` (a field deliberately absent from the admin `UpdateUserByIdRequest` contract).
- **`src/modules/account/services/tokens.ts`** — Token store; `update` calls `savedUser.tokenRemoveAll(TokenType.REFRESH)` on deactivation.
- **`src/modules/account/controllers/delete-account-request.ts`** — Likely caller of `remove(user, true)` for the self-service hard-delete path.
- **`scripts/reap-inactive-accounts.ts`** — Batch script that presumably iterates inactive users and calls `remove` / `update` in bulk.

## Notes

- **Soft-delete is a toggle, not a set.** Calling `remove(user, false)` on an already soft-deleted user *restores* it. The `hardDelete: false` half of the schema relies on this flip semantics.
- **`analyticsConsent` is intentionally excluded** from the admin `UpdateUserByIdRequest` type. It rides along the `update` signature as an extra field only the `account` module's `updateProfile` passes — consent is the data subject's, not the operator's.
- **Token revocation on deactivation is chained, not blocking.** A `tokenRemoveAll` failure must not convert a successful deactivation into a reported failure; `findAuthenticatableById` is the 1.2 backstop.
- **`enqueueIfPending` uses `void`** — the caller never awaits it. It is a queue publish, not a CPU-bound job.
- **`create` hardcodes `verified: true`.** The rationale: an operator typing the email address is the vouching. The self-service verification flow lives in the `account` module.
- **Validation uses the full schema, not `.pick()`.** A partial pick would leave `admin`/`active`/`imageUrl` unchecked, letting bad-typed values reach Mongoose (500) instead of returning the contracted 422.
- **`update` assigns fields individually** (no spread) so that absent keys leave the stored value untouched — including `analyticsConsent`, which is tri-state (absent = no change).
