---
source: src/modules/users/repository.ts
sha256: 00c6c22eb487df1c8150dd3e0612536dd2fffc1e4ec9fd3100cc79b264ca9ec9
generated_at: 2026-11-08T08:47:49.065031+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/repository.ts

## Purpose

The persistence (data-access) layer for the user collection. It wraps the Mongoose `userModel` with standard CRUD via the shared repository factory, then layers on every credential, MFA/2FA, activity-tracking, inactivity-reaping, purchase-hold, OAuth-link, and soft-delete operation that the `account` module needs across the domain-primitives boundary. All writes to sensitive fields flow through this single file so that credential re-selection, throttling, and atomicity guarantees are enforced in one place.

## Key elements

- **`userRepository`** (exported const) — The single public handle. Extends `Repository<UserDocument, UserWire>` (from the factory) with ~30 domain-specific methods: credential reads, MFA reservation/spend, 2FA write pipeline, delivered-code arming/spending, OAuth link/unlink, activity stamps, inactivity-reaper queries, purchase-hold claims, and scheduled-deletion lifecycle.
- **`CREDENTIAL_FIELDS`** (module-private) — The `+password +twoFactorMethods …` projection string. The *only* sanctioned way to re-select `select: false` fields; prevents scattered `.select('+password')` calls.
- **`TRUSTED_AUTHENTICATABLE_FILTER`** (exported) — `AUTHENTICATABLE_FILTER` with `$or` wrapped in Mongoose `trusted()` so it survives filter sanitization on queries that pass through the sanitizer.
- **`LAST_ACTIVE_EXPR`** (module-private) — `{$max: ['lastActiveAt','lastApiKeyUseAt','createdAt']}`; the single source of truth for "how recently was this account used", shared by every `findInactive*` query.
- **`stampDaily`** (module-private) — Throttles `lastActiveAt` / `lastApiKeyUseAt` to at most one write per day; uses `$max` to prevent the timestamp from moving backwards.
- **`codeSlotFilter` / `codeSlotPath`** (module-private) — Resolve the correct Mongoose path (`reauthCode.*` vs `twoFactorMethods.$.*`) for a given `DeliveredCodeSlot`, keeping 2FA-method and step-up code logic in one pair of helpers.
- **`trustedSignInFilter`** (module-private) — Extends the authenticatable filter to also admit owner-scheduled deletions still inside their grace window.
- **`reencrypt`** — Delegated to `reencryptOf(userModel)`; batch re-encryption of credential fields with dry-run support.
- **`writebackImage`** — Delegates to `imageWritebackFor`, tying the user document to the image-worker adapter for avatar/profile-image persistence.
- **`searchable` config** (passed to `createRepository`) — Defines object-id, text, regex, boolean (`active`), presence (`deletedAt`), and sort keys. Notably excludes a `role` filter (role is resolved via a separate membership collection in `@modules/access`).

## Relationships

- **`@infrastructure/persistence/create-repository`** — Supplies the generic `Repository` implementation (find, findById, insert, update, delete, `toObjectId`). This file spreads it into `userRepository` and adds domain methods on top.
- **`@infrastructure/security/reencrypt`** — Provides `reencryptOf`, `ReencryptSpec`, `ReencryptReport`; this file re-exports the bound `reencrypt` method.
- **`@infrastructure/persistence/external-key-query`** — Supplies `EXTERNAL_KEY_QUERY`, applied as a query option on `findOneWithCredentials` for external-key lookups.
- **`@infrastructure/persistence/image-writeback` / `@infrastructure/adapters/image.worker`** — Provide `imageWritebackFor` and the `ImageWriteback` type for avatar image persistence.
- **`@domain-primitives/time`** — Supplies `DAY_MS`, used as the `ACTIVITY_THROTTLE_MS` constant.
- **`./model`** — Source of `userModel`, `applyUserTransform`, `DELIVERED_CODE_FIELDS`, and all domain types (`UserDocument`, `OAuthAccount`, `MfaReservation`, `DeliveredCodeSlot`, etc.).
- **`./authenticatable`** — Source of `AUTHENTICATABLE_FILTER`, wrapped into `TRUSTED_AUTHENTICATABLE_FILTER`.
- **`./two-factor-write`** — Source of `twoFactorWritePipeline` and the `TwoFactorWrite` / `TwoFactorWriteOutcome` types consumed by `writeTwoFactor`.
- **`scenarios/users.ts`** — Scenario definitions that exercise this repository in integration/e2e tests.
- **`src/modules/account/tests/**`** — Contract and integration tests (auth races, delete-account, login paths, OAuth, reauth, lifecycle, code-delivery) that call `userRepository` methods directly or through the account module to verify persistence behavior.

## Notes

- **Type written out explicitly.** The `userRepository` annotation is spelled out rather than inferred because Mongoose's generics are too large for TypeScript to serialize across an export boundary (error TS7056). Don't try to "simplify" it to a `const x = {…}` without a type.
- **`trusted()` is load-bearing.** `TRUSTED_AUTHENTICATABLE_FILTER` and `trustedSignInFilter` wrap `$or` operators in Mongoose's `trusted()` so they survive the query sanitizer. Removing the wrapper will silently drop the `$or` clause on sanitized queries.
- **`CREDENTIAL_FIELDS` is the only door.** Any new code that needs `password`, 2FA fields, `reauthCode`, `oauthAccounts`, or `pendingEmail` must go through `findByIdWithCredentials` / `findOneWithCredentials` / `findByIdWithPendingEmail`, not a raw `.select('+…')`.
- **Activity stamps are throttled.** `touchLastActive` / `touchApiKeyUse` write at most once per calendar day per field; calling them on every request is a no-op after the first, but the filter check still hits the database.
- **`active` vs `deletedAt`.** The `searchable.booleans.active` filter targets the `active` column, *not* `deletedAt`. "Deactivated" and "deleted" are different queries.
- **No `role` filter.** The document has no `role` column; role-based search requires a two-step resolve through the membership collection (`@modules/access`) and is deliberately not expressed here.
- **`timestamps: false` on activity stamps.** `stampDaily` passes `timestamps: false` because a `lastActiveAt` update is not a profile edit; Mongoose's `updatedAt` is intentionally left untouched.
