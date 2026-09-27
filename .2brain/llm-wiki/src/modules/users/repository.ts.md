---
source: src/modules/users/repository.ts
sha256: 0cbb775ca0f2bad7e9930367bbdd43570cb9d6d638d1dc12f97df6703a3b6391
generated_at: 2026-09-27T15:38:39.372959+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/repository.ts

## Purpose
Persistence layer for the user collection. Wraps the shared `createRepository` factory with standard CRUD, then layers on the credential, token, OAuth-link, and inactivity-sweep operations that the `account` module needs across the shared-kernel edge. All sensitive fields (`password`, `tokens`, 2FA material, `oauthAccounts`, `pendingEmail`) are `select: false` on the schema; this file is the single sanctioned place to re-select them.

## Key elements
- **`userRepository`** (export) — the sole public export. Spreads `createRepository<UserDocument, UserWire>(userModel, …)` for standard CRUD, then adds domain-specific methods. The type is written out explicitly (not inferred) because Mongoose's generics overflow TypeScript's serialization limit (TS7056).
- **`CREDENTIAL_FIELDS`** (const) — the `+password +tokens +twoFactor… +oauthAccounts +pendingEmail` re-select string; the only place re-selection is spelled out.
- **`AUTHENTICATABLE_FILTER`** (const) — `{ active: { $ne: false }, deletedAt: undefined }`; shared by `findAuthenticatableById` / `findAuthenticatableByEmail` so the two can't drift.
- **`LAST_ACTIVE_EXPR`** (const) — aggregation `$expr` computing the latest `tokens[].lastUsedAt` or `createdAt`; reused by every `findInactive*` query.
- **`findByIdWithCredentials` / `findOneWithCredentials`** — fetch a user with all sensitive fields re-selected.
- **`findByIdWithPendingEmail`** — lighter variant that re-selects only `pendingEmail` (used by `GET /account`).
- **`emailOrPendingEmailTaken`** — request-time collision check against both `email` and `pendingEmail` columns (excluding the caller's own id).
- **`findByToken` / `findByTokenValue`** — locate a user by a (hashed) token; `findByToken` also filters on token `type` via `$elemMatch` on the same array entry.
- **`tokenRemove` / `tokenRemoveByValue` / `tokenRemoveExpired`** — atomic `$pull`-based token spending and sweeping (avoids load-modify-save and `VersionError`); all pass `timestamps: false`.
- **`tokenSupersede` / `tokenTouch`** — rotation and last-used stamping.
- **`sessionRemove`** — remove a specific session from the token array.
- **`linkOAuthAccount`** — attach an `OAuthAccount` entry to a user document.
- **`writebackImage`** — typed as `ImageWriteback` (from `image.worker`), wired through the repository for profile-image persistence.
- **`findInactiveUnwarned` / `findWarnedStillInactive` / `findReaperSoftDeletedPastGrace`** — inactivity-sweep queries built on `LAST_ACTIVE_EXPR`.
- **`updateMany`** — raw multi-document update passthrough.
- **`searchable` config** — declares `objectIds`, `text`, `regex`, `booleans` (`active`), and `presence` (`deleted`) filters for the generic search API; deliberately omits `role` (no column; would need a two-step resolve via `@modules/access`).

## Relationships
- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository`, `toObjectId`, and the `Repository` base type; `userRepository` spreads its return value as the foundation of every method.
- **`src/infrastructure/adapters/image.worker.ts`** — supplies the `ImageWriteback` type used for the `writebackImage` method.
- **`./model`** (same module, not in the neighbor list) — source of `userModel`, `applyUserTransform`, `hashToken`, `TokenType`, and the `UserDocument` / `Token` / `OAuthAccount` / `UserWire` types.
- **`src/modules/account/tests/contract/*` and `src/modules/account/tests/integration/*`** — exercise the auth, token, OAuth, 2FA, deletion, and locale flows that call into `userRepository`; they pin the behavioral contract (e.g., `findAuthenticatableByEmail` must return `null` for deleted or `active: false` accounts, `tokenRemove` must be idempotent).
- **`scenarios/users.ts`** — end-to-end scenario definitions that drive user CRUD and lifecycle transitions against this repository.

## Notes
- Every token value is **hashed before it touches a query or update** (`hashToken`); the plaintext never reaches Mongoose.
- Token spend uses **atomic `$pull`**, not load → modify → `save()`. This is a deliberate fix for a `VersionError` race in the reset-confirm flow (two simultaneous confirms both loaded version V).
- `tokenRemoveExpired` has two retention concerns that must not be collapsed: the **expiration** sweep and the **superseded-rotation** retention window. The caller passes the reuse-detection window as `supersededRetentionMs`; equating it to the rotation grace window would delete entries the reuse check still needs.
- `active: { $ne: false }` (rather than `=== true`) means a document with no `active` field is treated as enabled — absent ≠ locked out.
- `select: false` trims query *results* only; `$expr` filters (e.g. `LAST_ACTIVE_EXPR`) can still read `tokens` from the stored document.
- The `role` filter is intentionally absent from `searchable`: the user document has no `role` column; role-based narrowing lives in `@modules/access` and requires a two-step resolve that the generic `exact` filter cannot express.
