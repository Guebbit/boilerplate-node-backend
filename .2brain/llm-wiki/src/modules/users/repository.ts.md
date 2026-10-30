---
source: src/modules/users/repository.ts
sha256: 64d290fad6f351ff7f602d05ede1c8c3e1ac7fa28550a03505506373c83fb070
generated_at: 2026-10-29T06:14:39.757378+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/repository.ts

## Purpose

Persistence layer for the `users` collection. It combines the generic CRUD provided by the repository factory with every user-specific query the `account` module needs: credential reads, MFA / delivered-code operations, OAuth account linking, activity stamping, inactivity-reaping aggregations, purchase-hold claims, and the scheduled-deletion lifecycle. It exists so that all of those concerns live in one module instead of being scattered across service code.

## Key elements

- **`userRepository`** — the single export. A composite object spread over `createRepository` with ~40 additional methods covering credentials, MFA, OAuth, activity, inactivity, purchase holds, and scheduled deletion.
- **`CREDENTIAL_FIELDS`** — the one sanctioned `select` string (`+password +twoFactorMethods +… +pendingEmail +previousEmail`). All other finders never load these `select: false` fields.
- **`LAST_ACTIVE_EXPR`** — an aggregation `$expr` (`$max` of `lastActiveAt`, `lastApiKeyUseAt`, `createdAt`) shared by every `findInactive*` query so "last proof of life" is defined once.
- **`NOT_WARNED_THIS_STRETCH`** — filter fragment: account was never warned, *or* has been active again since the last warning.
- **`stampDaily(id, field, now)`** — writes `lastActiveAt` or `lastApiKeyUseAt` at most once per day (`$max` in the update prevents the stamp moving backwards).
- **`codeSlotFilter` / `codeSlotPath`** — address a delivered-code slot in either `reauthCode.*` (flat) or a specific `twoFactorMethods.$.*` entry (via `$elemMatch`).
- **`TRUSTED_AUTHENTICATABLE_FILTER`** — `AUTHENTICATABLE_FILTER` wrapped in Mongoose `trusted()` so it survives query sanitisation.
- **`trustedSignInFilter(now)`** — extends the above to also admit owner-scheduled deletions still inside their grace window.
- **`clearedCode(slot)`** — builds a document that `$unset`s every field of a code slot.
- **`userRepository.reencrypt`** — delegates to `reencryptOf(userModel)` for bulk credential re-encryption.
- **`userRepository.writebackImage`** — delegates to `imageWritebackFor` for avatar/image write-back.
- **MFA / code methods** — `reserveMfaAttempt`, `claimTotpStep`, `spendBackupCode`, `spendDeliveredCode`, `recordDeliveredMiss`, `armReauthCode`, `bumpSessionEpoch`, `writeTwoFactor` (via `twoFactorWritePipeline`).
- **Inactivity / reaper queries** — `findInactiveUnminimised`, `findInactiveUnwarned`, `findWarnedStillInactive`, `findReaperSoftDeletedPastGrace`, `findScheduledDeletionsDue`, `clearLapsedPreviousEmail`.
- **Scheduled-deletion lifecycle** — `restoreScheduledDeletion`, `claimScheduledErasure`, `forgetHoldSetter`.
- **Purchase-hold methods** — `claimPurchaseHold`, `claimPurchaseHoldReview`, `reduceExpiredPurchaseHolds`.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies `createRepository`, `toObjectId`, and the `Repository` base type that `userRepository` spreads and extends.
- **`src/infrastructure/persistence/external-key-query.ts`** — provides `EXTERNAL_KEY_QUERY`, applied as a query option in `findOneWithCredentials`.
- **`src/infrastructure/security/reencrypt.ts`** — provides `reencryptOf` and the `ReencryptSpec` / `ReencryptReport` types used by `userRepository.reencrypt`.
- **`src/infrastructure/persistence/image-writeback.ts`** — provides `imageWritebackFor`, used to construct `userRepository.writebackImage`.
- **`src/infrastructure/adapters/image.worker.ts`** — supplies the `ImageWriteback` type that `writebackImage` conforms to.
- **`src/domain-primitives/time.ts`** — supplies `DAY_MS`, used as `ACTIVITY_THROTTLE_MS` for the daily activity-stamp throttle.
- **`src/modules/users/authenticatable.ts`** — provides `AUTHENTICATABLE_FILTER`, wrapped into `TRUSTED_AUTHENTICATABLE_FILTER`.
- **`src/modules/users/two-factor-write.ts`** — provides `twoFactorWritePipeline` and its types, consumed by `userRepository.writeTwoFactor`.
- **`src/modules/users/model.ts`** — provides `userModel`, `applyUserTransform`, `DELIVERED_CODE_FIELDS`, and all document/wire types.
- **`scenarios/users.ts`** and the **account contract/integration tests** (`oauth`, `login-paths`, `reauth`, `lifecycle`, `code-delivery`, `delete-account`, `auth-races`) — downstream consumers that exercise the MFA, deletion, and sign-in paths through this repository.

## Notes

- Credential fields are `select: false` on the Mongoose schema. `CREDENTIAL_FIELDS` is the **only** sanctioned re-selection; do not add ad-hoc `.select('+password')` calls elsewhere.
- `TRUSTED_AUTHENTICATABLE_FILTER` and `trustedSignInFilter` use Mongoose's `trusted()` wrapper so their operators survive the sanitiser that strips untrusted user input from query filters.
- The explicit type annotation on `userRepository` is not optional: TypeScript cannot serialise the inferred generic at an export boundary (TS7056). This is the same reason the `Repository` type exists in `create-repository`.
- `LAST_ACTIVE_EXPR` uses `$max`, which silently ignores missing fields — an account that never signed in falls back to `createdAt` without special-casing.
- `stampDaily` uses `$max` in the *update* (not just the filter), so concurrent writes can never regress the timestamp.
- `codeSlotFilter` for two-factor methods uses `$elemMatch` so that all field conditions and the positional `$` update target the **same** array entry.
- The `searchable` config intentionally omits a `role` filter: role is not a column on the user document and resolving it requires a two-step membership lookup the generic filter cannot express.
