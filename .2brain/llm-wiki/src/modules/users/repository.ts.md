---
source: src/modules/users/repository.ts
sha256: 2bf827a65c0da64a7244b73062f1b3c7d2d616eb7c6fb10ed2b1053bb8fb77e0
generated_at: 2026-11-14T22:25:05.299920+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/repository.ts

## Purpose

The persistence layer for the `users` collection. It composes the generic `createRepository` factory (standard CRUD, search, sort) with the credential, 2FA/MFA, OAuth, deletion-lifecycle, and activity-tracking operations that the `account` module needs. All credential fields are `select: false` on the schema; this file centralises the only sanctioned re-selection paths.

## Key elements

- **`userRepository`** — the single exported object. Extends `Repository<UserDocument, UserWire>` with ~40 domain-specific methods (MFA reservation/spend, OAuth link/unlink, scheduled-deletion state, purchase holds, inactivity reaping, credential reads, image writeback, reencrypt).
- **`CREDENTIAL_FIELDS`** — the `+password +twoFactorMethods …` select string. The *only* place that re-selects hidden fields; do not add ad-hoc `.select('+…')` calls elsewhere.
- **`LAST_ACTIVE_EXPR`** — a Mongoose `$expr` (`$max` of `lastActiveAt`, `lastApiKeyUseAt`, `createdAt`) shared by every `findInactive*` query so "how recently was this account used" is defined once.
- **`stampDaily`** — throttles `lastActiveAt` / `lastApiKeyUseAt` updates to once per day (`ACTIVITY_THROTTLE_MS = DAY_MS`); uses `$max` so the stamp never moves backwards.
- **`codeSlotFilter` / `codeSlotPath`** — resolve a `DeliveredCodeSlot` (reauth vs. a specific 2FA method) to the correct document path and `$elemMatch` filter.
- **`TRUSTED_AUTHENTICATABLE_FILTER` / `trustedSignInFilter`** — wrap `AUTHENTICATABLE_FILTER` operators in `mongoose.trusted()` so they survive Mongoose's query sanitization; the sign-in variant also admits owner-scheduled deletions still inside their grace window.
- **`clearedCode`** — builds the `$unset` document that zeroes every field of a delivered-code slot.
- **`searchable` config** passed to `createRepository` — defines object-id, text, regex, boolean, presence, and sort facets. Note: no `role` facet (requires a two-step membership resolve that the generic filter cannot express).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies `createRepository`, `toObjectId`, and the base `Repository` type that `userRepository` spreads.
- **`src/infrastructure/security/reencrypt.ts`** — `reencryptOf(userModel)` is attached as `userRepository.reencrypt` for bulk key-rotation.
- **`src/infrastructure/persistence/versioning.ts`** — `fencedSave` provides optimistic-concurrency saves used by `saveWithoutEdit`.
- **`src/infrastructure/persistence/external-key-query.ts`** — `EXTERNAL_KEY_QUERY` builds the `(provider, providerId)` lookup for `findForSignInByOAuthIdentity`.
- **`src/infrastructure/persistence/image-writeback.ts`** — `imageWritebackFor` backs the `writebackImage` method.
- **`src/infrastructure/adapters/image.worker.ts`** — supplies the `ImageWriteback` type for that method's signature.
- **`src/domain-primitives/time.ts`** — `DAY_MS` sets the activity-stamp throttle.
- **`./authenticatable`** (local) — `AUTHENTICATABLE_FILTER` is the base filter re-wrapped with `trusted()`.
- **`./two-factor-write`** (local) — `twoFactorWritePipeline` and the `TwoFactorWrite` / `TwoFactorWriteOutcome` types drive `writeTwoFactor`.
- **`./model`** (local) — `userModel` (Mongoose model), `applyUserTransform`, `DELIVERED_CODE_FIELDS`, and all document/wire types.
- **`scenarios/users.ts`** and the **`account` contract/integration tests** — consume `userRepository` to exercise sign-in, OAuth, reauth, code-delivery, lifecycle, and race-condition paths.

## Notes

- The explicit type annotation on `userRepository` (rather than `satisfies` or inference) exists because Mongoose's generics produce a type too large for TS to serialize at an export boundary (TS7056). Don't remove it.
- `timestamps: false` is passed to `stampDaily`'s update: activity stamps are not profile edits and must not bump `updatedAt`.
- `fencedSave` (from `versioning`) is the concurrency-safe save path; plain `.save()` is avoided for mutations that can race.
- `trusted()` wrappers are load-bearing: without them Mongoose's `sanitizeFilter` strips the `$or` / `$eq` operators and the sign-in queries silently return no rows.
- The reaper "not yet warned" check (`NOT_WARNED_THIS_STRETCH`) uses `$type: 'missing'` *or* `lastActive > warnedAt` so a returning user is re-warnable without a write at login time.
