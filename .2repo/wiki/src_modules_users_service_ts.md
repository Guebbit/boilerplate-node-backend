# src/modules/users/service.ts

## Purpose

Admin-facing user CRUD and search service. Handles creating, reading, updating, and deleting user documents on behalf of an operator, plus paginated search for the admin panel. Explicitly scoped *away* from authentication (signup, login, password reset, token lifecycle) which lives in the `account` module.

## Key elements

- **`validateData(userData, requirePassword?)`** — Runs the full `zodUserSchema` (or a partial variant when `requirePassword` is false) against `unknown` input; returns `ResponseErrorItem[]` (empty = valid). Intentionally validates the whole schema so no field slips through to Mongoose as a 500.
- **`search(filters?)`** — Paginated user search; delegates to `userRepository.search`. Returns `{ items, meta: PaginatedMeta }`.
- **`getById(id?)`** — Fetches one user by ID. Resolves to `undefined` (not a rejection) when `id` is falsy.
- **`enqueueIfPending(user)`** — Fire-and-forget (`void`) dispatch of `enqueueImageDigest` when the document carries a `pendingImageKey`. Returns the user for chaining; callers must not await the digest.
- **`create(data, context)`** — Admin user creation. Hardcodes `verified: true`. If no password is supplied, fills the required field with `randomBytes(32).toString('hex')`. Emits audit + analytics events, optionally emits `USER_SETUP_REQUESTED` domain event to queue a setup email.
- **`update(user, data)`** — Field-by-field mutation of a loaded `UserDocument`. Image trio (`imageUrl` / `thumbnailUrl` / `pendingImageKey`) is set atomically. Returns a `ResponseSuccess | ResponseReject` envelope (never throws).
- **`updateById(id, data, context)`** — Loads the document via `findByIdWithCredentials`, delegates to `update`, then emits audit and (if `active === false`) a `USER_DEACTIVATED` analytics event.
- **`remove(user, hardDelete?)`** — Soft delete toggles `deletedAt` (re-running on an already-soft-deleted user *restores* it). Hard delete awaits `USER_DELETED` domain event emission before calling `userRepository.deleteOne`.
- **`findByEmail(email)`** — Looks up a user by email, loading credentials (`select: false` fields included) because callers immediately write a token onto the document.
- **`consumeToken(user, token)`** — Atomic `$pull` of a token from the user's token array. Returns `true` only for the write that actually removed it.

## Relationships

- **`@infrastructure/http/response`** — Source of `generateSuccess`, `generateReject`, `validationErrors`, and the `ResponseSuccess` / `ResponseReject` / `ResponseErrorItem` types used as return contracts throughout.
- **`@infrastructure/http/request`** — Provides the `CallerContext` type threaded into `create` and `updateById` for audit/analytics attribution.
- **`@infrastructure/i18n`** — `t()` used for user-facing messages (`users.not-found`, `users.hard-deleted`, `users.soft-deleted`).
- **`@infrastructure/observability/audit`** — `emitAuditEvent` / `buildAuditEvent` called in `create` and `updateById`.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` / `buildAnalyticsBase` called in `create` and `updateById`.
- **`@infrastructure/adapters/image.worker`** — `enqueueImageDigest` called (fire-and-forget) from `enqueueIfPending`.
- **`@kernel/events`** — `emitDomainEvent` used for `USER_SETUP_REQUESTED` (create) and `USER_DELETED` (hard delete).
- **`@infrastructure/persistence/search`** — `PaginatedMeta` type in the `search` return signature.
- **`src/modules/account/…` (consumers)** — `findByEmail` is called by the account module's reset-request and delete-account flows; `consumeToken` is called by the reset-confirm path. This service does not import from `account`, keeping the dependency arrow one-directional.

## Notes

- **Whole-schema validation is deliberate.** `validateData` calls `schema.safeParse` on the complete schema (or `.partial({ password: true })`), never a `.pick()`. A pick would let wrong-typed `admin` / `active` / `imageUrl` reach Mongoose and surface as a 500 instead of the promised 422.
- **`update` typing history.** The parameter is typed off `UpdateUserByIdRequest` rather than a hand-picked `Pick` because a previous hand-copied list silently omitted `active`, causing `active: false` to fire `USER_DEACTIVATED` without persisting the field.
- **Soft delete is a toggle, not a set.** `user.deletedAt = user.deletedAt ? undefined : new Date()` — calling `remove` on an already soft-deleted user restores them.
- **Hard delete emits before writing.** `emitDomainEvent(USER_DELETED, …)` is awaited *before* `deleteOne`, so downstream subscribers (e.g. cart cleanup) complete first. Only the hard path emits; a soft delete is treated as "a restore waiting to happen."
- **`consumeToken` uses `$pull`, not read-modify-write.** Two simultaneous confirms of the same reset token would otherwise both load version V and the second write would raise a `VersionError` (500) on a request that had already succeeded. `$pull` makes the second consume a no-op.
- **`enqueueIfPending` is `void`.** It is a queue publish, not a CPU-bound digest. Callers chain it for convenience but must not await the underlying work.
