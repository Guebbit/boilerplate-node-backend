# src/modules/users/repository.ts

## Purpose
Persistence layer for the `users` collection. Exposes standard CRUD (via the shared repository factory) plus the credential reads and token-lifecycle operations that the `account` module needs on the far side of the shared-kernel edge. Keeps all re-selection of `select: false` fields and atomic token mutations in one place so they aren't scattered across services.

## Key elements

- **`userRepository`** — single export; a `Repository<UserDocument>` (from the factory) augmented with credential, token, session, inactivity, and image-writeback methods.
- **`CREDENTIAL_FIELDS`** — constant `'+password +tokens +twoFactorSecret …'` string; the only sanctioned re-select clause for `select: false` fields.
- **`AUTHENTICATABLE_FILTER`** — `{ active: { $ne: false }, deletedAt: undefined }`; shared by every login-adjacent lookup so the clause can't drift.
- **`LAST_ACTIVE_EXPR`** — aggregation `$expr` (`$max` of `tokens.lastUsedAt` or `createdAt`) reused by all `findInactive*` / `findReaper*` queries.
- **`findByIdWithCredentials` / `findOneWithCredentials`** — fetch a user with credential fields re-selected.
- **`findByToken`** — `$elemMatch` on `{ token: hashToken(t), type }` to match both conditions on the *same* array entry; returns user with credentials.
- **`findByTokenValue`** — untyped-by-kind revocation lookup (no `type` param); carries `AUTHENTICATABLE_FILTER`; selects `+tokens` for rotation reads.
- **`findAuthenticatableById`** — `findById` scoped to active, non-deleted accounts; sole caller is `resolve()` in `account/module.ts`.
- **`tokenRemove` / `tokenRemoveByValue`** — atomic `$pull` to spend one token (by id+value, or by value alone for single-session logout).
- **`tokenRemoveExpired`** — bulk `$pull` of expired and superseded-past-grace tokens across all documents; returns a plain count.
- **`tokenTouch`** — positional `$set` of `tokens.$.lastUsedAt` so concurrent refreshes don't clobber each other.
- **`tokenSupersede`** — atomic claim for rotation; `$elemMatch` ensures exactly one concurrent caller wins (`modifiedCount: 1`).
- **`sessionRemove`** — removes a session entry by user id + session id.
- **`findInactiveUnwarned` / `findWarnedStillInactive` / `findReaperSoftDeletedPastGrace`** — inactivity and grace-period sweeps for the reaper script.
- **`writebackImage`** — `ImageWriteback`-typed callback for image persistence.
- **`searchable` config** (inside the factory call) — defines `objectIds`, `text`, `regex`, and `booleans` facets for list/filter endpoints.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies `createRepository`, `toObjectId`, and the `Repository` type; `userRepository` spreads the factory's base CRUD underneath its own methods.
- **`src/infrastructure/adapters/image.worker.ts`** — provides the `ImageWriteback` type that `writebackImage` is typed against.
- **`src/modules/account/module.ts`** — `resolve()` is the explicit sole caller of `findAuthenticatableById`; the module orchestrates which repository methods a request invokes.
- **`src/modules/account/services/authentication.ts`** — consumes `findByTokenValue`, `tokenSupersede`, `tokenTouch`, `tokenRemoveByValue` during login / refresh.
- **`src/modules/account/services/token-cleanup.ts`** — calls `tokenRemoveExpired`, passing in `supersededGraceMs` (session policy config lives in `account`, not here).
- **`src/modules/account/services/two-factor.ts`** — uses `findByIdWithCredentials` / `findOneWithCredentials` to read 2FA fields.
- **`src/modules/account/services/verification.ts`** — uses `findByToken` for email/verification link resolution.
- **`src/modules/account/services/profile.ts`** — uses credential-aware fetchers for profile operations.
- **`src/modules/account/services/export.ts`** — reads user data through the repository for account export.
- **`scripts/reap-inactive-accounts.ts`** — the operational consumer of `findInactiveUnwarned`, `findWarnedStillInactive`, and `findReaperSoftDeletedPastGrace`.
- **`src/modules/account/session/jwt.ts`** — the session/token model that `tokenTouch`, `tokenSupersede`, and `findByTokenValue` serve.
- **Tests** (`api.contract.test.ts`, `jwt.test.ts`, `persisted-locale.test.ts`) — exercise the repository through the account API surface.

## Notes

- **`select: false` is load-bearing.** `password`, `tokens`, and 2FA fields are hidden by default on the schema. Always go through `*WithCredentials` helpers; ad-hoc `.select('+password')` is explicitly discouraged.
- **`$ne: false` vs `true`.** `active` can be *absent* on rows written before the `20260808120000` migration, so the filter uses `{ $ne: false }`, not `true`.
- **Tokens are stored hashed (wave 3.1).** Every query path calls `hashToken(token)` before building the filter; never compare plaintext.
- **`$elemMatch` is intentional in `findByToken` and `tokenSupersede`.** A naive two-path filter would match a reset-token entry via an unrelated delete-token entry on the same document.
- **`timestamps: false` on all token mutations.** Spending, touching, superseding, or expiring a token is not a semantic change to the account and must not bump `updatedAt`.
- **`tokenRemoveExpired` takes `supersededGraceMs` as a parameter** rather than importing the config. That value is session-policy owned by `account`; this module must not import it (shared-kernel boundary).
- **Explicit type annotation on `userRepository`.** Mongoose's inferred generic is too large for TS to serialize at an export boundary (TS7056), so the type is written out by hand.
- **`LAST_ACTIVE_EXPR` works despite `select: false`.** `select` trims what a query *returns*, not what a `$expr` aggregation may read from the stored document.
- **`searchable.booleans.active` filters the real column**, not `deletedAt` existence — "deactivated" and "deleted" are intentionally distinct questions.
- **`admin` / `verified` are exposed in `searchable`** only because the listing endpoint already returns 403 to non-staff, making the filter safe to publish.
