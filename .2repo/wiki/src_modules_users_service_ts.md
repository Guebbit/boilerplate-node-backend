# src/modules/users/service.ts

## Purpose

Admin-facing user CRUD and search service. It owns the write path for user documents created or modified by operators (create, update, soft/hard delete) and provides token-based lookups consumed by the `account` module. Authentication flows (signup, login, password reset) live in the `account` module; this file is the complementary admin surface.

## Key elements

- **`validateData(userData, requirePassword?)`** — Runs the full `zodUserSchema` (or a password-optional variant) against raw input and returns UI-friendly error items. Deliberately accepts `unknown` because it is the type-establishing boundary.
- **`search(filters)`** — Paginated user search for the admin panel; delegates to `userRepository.search` and returns `{ items, meta: PaginatedMeta }`.
- **`getById(id?)`** — Single-user lookup by ID; resolves `undefined` when no ID is supplied.
- **`create(data, context)`** — Creates a user with `verified: true` hardcoded (admin vouches for the address). Emits an audit event and an analytics event keyed on the new user's ID.
- **`update(user, data)`** — Field-by-field assignment onto an already-loaded document, then saves. Returns a `ResponseSuccess | ResponseReject` envelope (no throws).
- **`updateById(id, data, context)`** — Fetches the document (with credentials), delegates to `update()`, emits audit + analytics events on success. Emits `USER_DEACTIVATED` specifically when `active` flips to `false`.
- **`remove(user, hardDelete?)`** — Soft delete toggles `deletedAt`; hard delete emits `USER_DELETED` domain event (awaited) before calling `userRepository.deleteOne`, allowing the cart module to clean up.
- **`findByEmail` / `findByPasswordResetToken` / `findByAccountDeleteToken`** — Token/email lookups used by `account` controllers and services. All return the document with credentials populated.
- **`consumeToken(user, token)`** — Atomic `$pull` of a one-time token from the user's `tokens` array. Returns `true` only if this call's write actually removed the token (disambiguates concurrent duplicate clicks).

## Relationships

- **`@infrastructure/http/response`** — All write operations return `ResponseSuccess`/`ResponseReject` envelopes; `validateData` maps Zod errors to `ResponseErrorItem[]` via `validationErrors`.
- **`@infrastructure/http/request`** — Imports the `CallerContext` type, passed by controllers into `create`, `updateById` for audit/analytics attribution.
- **`@infrastructure/i18n`** — Uses `t()` for user-facing status messages (e.g. `users.not-found`, `users.hard-deleted`).
- **`@infrastructure/observability/audit`** — `create` and `updateById` emit structured audit events via `buildAuditEvent` / `emitAuditEvent`.
- **`@infrastructure/observability/analytics`** — Emits `USER_CREATED` (on create) and `USER_DEACTIVATED` (on deactivation) analytics events.
- **`@infrastructure/persistence/search`** — `search` return type includes `PaginatedMeta` from the shared pagination helper.
- **`@kernel/events`** — `remove(hardDelete=true)` emits `USER_DELETED` and **awaits** it before deleting, so subscribers (cart) can clean up first.
- **`./analytics`** — Supplies `usersAnalyticsEvents` enum used in analytics payloads.
- **`./audit`** — Supplies `usersAuditActions` enum used in audit payloads.
- **`src/modules/account/services/tokens.ts`** — Calls `findByPasswordResetToken`, `findByAccountDeleteToken`, and `consumeToken` during reset/delete flows.
- **`src/modules/account/controllers/delete-account-request.ts`** — Calls `findByAccountDeleteToken` to locate the user before confirming deletion.
- **`src/modules/account/services/profile.ts`** — Calls `findByEmail` for profile lookups.
- **`src/modules/cart/tests/integration/service.test.ts`** — Exercises the `USER_DELETED` event path to verify cart cleanup on hard delete.
- **`src/modules/account/tests/unit/delete-account.test.ts`** — Unit-tests the token-consume and remove flows.
- **`src/modules/account/tests/integration/persisted-locale.test.ts`** — Verifies the `locale` field written by `update` persists correctly.

## Notes

- **Type your parameters off the generated contract shape** (`CreateUserRequest`, `UpdateUserByIdRequest`), not a hand-picked `Pick<UserRecord, …>`. A hand-picked list previously dropped `active`, causing `PUT /users/:id` to fire `USER_DEACTIVATED` analytics without actually writing the field.
- **`verified` is hardcoded `true` in `create`.** It is not part of `CreateUserRequest`; the admin is implicitly vouching for the address. The self-service `accountService.signup` leaves it `false`.
- **`validateData` validates the full schema, not a `.pick()`.** A narrower pick would let wrongly-typed `admin`, `active`, or `imageUrl` reach Mongoose and surface as a 500 CastError instead of the promised 422.
- **`consumeToken` uses `$pull`, not read-modify-write.** Two simultaneous confirms of one reset link both pass the existence check; `$pull` makes the second a no-op at mongod level instead of a `VersionError` → 500.
- **Soft delete is a toggle.** Calling `remove` twice on an already-soft-deleted user restores it. The cart is intentionally left intact on soft delete (restoreable); only the hard path emits `USER_DELETED` to trigger cart cleanup.
- **`findByEmailVerifyToken` is private** (no `export`), used only internally by the account module's verification flow.
