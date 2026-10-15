---
source: src/modules/users/repository.ts
sha256: 9eee6fc5d1cb84d4491c35b7d34d3b145dd7d1fcd843985470348bf0629b0691
generated_at: 2026-10-15T12:09:30.564345+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/repository.ts

## Purpose

Persistence layer for the user collection. It combines the shared repository factory (standard CRUD + search) with the credential, token, MFA, and inactivity-tracking operations that the `account` module needs across the shared-kernel boundary, keeping all user-document I/O in one file.

## Key elements

- **`userRepository`** (export) — the single repository object. Spreads `createRepository` for CRUD/search, then layers domain-specific methods:
  - **Credential-scoped reads** — `findByIdWithCredentials`, `findOneWithCredentials`, `findByIdWithPendingEmail`: the only sanctioned way to re-select `select: false` fields (password, 2FA, reauth, OAuth, pendingEmail).
  - **Auth-scoped reads** — `findAuthenticatableById`, `findAuthenticatableByEmail`: filter by `AUTHENTICATABLE_FILTER` so deactivated/deleted accounts are excluded; the only paths `account/services/login.ts` and `account/module.ts` use.
  - **Email collision** — `emailOrPendingEmailTaken`: checks both the proven `email` and in-flight `pendingEmail` columns (request-time half of the swap rule).
  - **OAuth** — `linkOAuthAccount`, `unlinkOAuthAccount`.
  - **MFA / delivered codes** — `reserveMfaAttempt`, `resetMfaAttempts`, `claimTotpStep`, `spendBackupCode`, `spendDeliveredCode`, `recordDeliveredMiss`, `armReauthCode`, `writeTwoFactor` (delegates to `twoFactorWritePipeline`).
  - **Session / epoch** — `bumpSessionEpoch` (accepts a Mongoose `ClientSession`).
  - **Activity stamping** — `touchLastActive`, `touchApiKeyUse`: daily-throttled `$max` upserts so the timestamp never moves backwards.
  - **Inactivity reaper** — `markInactivityMinimised`, `findInactiveUnminimised`, `findInactiveUnwarned`, `findWarnedStillInactive`, `findReaperSoftDeletedPastGrace`: batch queries for the reaper's sweep.
  - **Housekeeping** — `clearLapsedPreviousEmail`, `updateMany`.
  - **`writebackImage`** — typed as `ImageWriteback` from the image worker.
  - **`reencrypt`** — delegated to `reencryptOf(userModel)`.
- **`CREDENTIAL_FIELDS`** — the `+password +twoFactorMethods …` select string; the single place that re-selects hidden fields.
- **`LAST_ACTIVE_EXPR`** — `$max` aggregation expression over `lastActiveAt`, `lastApiKeyUseAt`, `createdAt`; shared by all `findInactive*` queries.
- **`codeSlotFilter` / `codeSlotPath` / `clearedCode`** — helpers that build the correct MongoDB filter and update path for a delivered-code slot (either `reauthCode.*` or a `$elemMatch` into `twoFactorMethods`).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies the `createRepository` factory and `toObjectId` helper that form the base CRUD/search layer of `userRepository`.
- **`src/infrastructure/security/reencrypt.ts`** — supplies `reencryptOf`, `ReencryptSpec`, `ReencryptReport` for the `reencrypt` method.
- **`src/infrastructure/adapters/image.worker.ts`** — supplies the `ImageWriteback` type for the `writebackImage` field.
- **`scenarios/users.ts`** — scenario/test setup that exercises this repository.
- **`src/modules/account/tests/…`** (contract & integration suites) — exercise the repository indirectly through the account module's API (login, OAuth, 2FA, email-change, delete-account, JWT, etc.).

## Notes

- The full type of `userRepository` is written out explicitly rather than inferred: Mongoose's generics produce a type too large for TypeScript to serialize at an export boundary (TS7056).
- `active` in the searchable config filters the real `active` column, **not** `deletedAt` existence — "deactivated" and "deleted" are different questions.
- There is deliberately **no** `role` filter in `searchable`; role lives in `@modules/access` and would require a two-step resolve the generic `exact` filter cannot express.
- `findAuthenticatableById` passes the raw `id` string (not `toObjectId`) so a malformed id rejects as a client error rather than throwing synchronously before a promise exists.
- `stampDaily` sets `timestamps: false` because an activity stamp is not a profile edit; `$max` in the update ensures the timestamp never regresses.
- `NOT_WARNED_THIS_STRETCH` allows a returning user to receive a fresh inactivity warning later **without** requiring a write at login time.
