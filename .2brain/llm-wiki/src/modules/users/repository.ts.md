---
source: src/modules/users/repository.ts
sha256: b4997e1397c079e768fa63756873cd1f5ac81c8f198559e0e3327bcc15e3fb42
generated_at: 2026-09-23T19:34:01.567185+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/repository.ts

## Purpose

Persistence layer for the user collection. Wraps the shared repository factory with standard CRUD, then adds the credential reads, token lifecycle operations, and soft-delete/inactivity queries that the `account` module needs across the shared-kernel boundary.

## Key elements

- **`userRepository`** — the single export. A `Repository<UserDocument, UserWire>` augmented with ~20 domain-specific methods (credential fetches, token spend/supersede/touch, OAuth linking, image writeback, inactivity sweeps).
- **`CREDENTIAL_FIELDS`** — the `+password +tokens +twoFactorMethods +twoFactorBackupCodes +oauthAccounts +pendingEmail` select string; the only sanctioned way to re-select `select: false` fields.
- **`AUTHENTICATABLE_FILTER`** — `{ active: { $ne: false }, deletedAt: undefined }`; shared by `findAuthenticatableById` and `findByTokenValue`.
- **`LAST_ACTIVE_EXPR`** — aggregation `$expr` (`$max` of `tokens.lastUsedAt` array or `createdAt`); shared by all `findInactive*` / `findReaper*` queries.
- **`findByIdWithCredentials` / `findOneWithCredentials`** — fetch a user including all sensitive fields.
- **`findByIdWithPendingEmail`** — narrower variant: only re-selects `pendingEmail` (for the self-service profile banner).
- **`emailOrPendingEmailTaken`** — request-time uniqueness check across `email` and `pendingEmail`.
- **`findByToken`** — `$elemMatch` on `tokens` array (token hash + type on the *same* entry); returns user with credentials.
- **`findAuthenticatableById`** — `findById` scoped to accounts that may still authenticate (active ≠ false, not soft-deleted).
- **`tokenRemove` / `tokenRemoveByValue`** — atomic `$pull` of a single token; idempotent, `timestamps: false`.
- **`tokenRemoveExpired`** — bulk `$pull` of expired tokens plus superseded tokens past the retention window; returns a count.
- **`tokenTouch` / `tokenSupersede` / `sessionRemove`** — remaining token/session lifecycle operations.
- **`linkOAuthAccount`** — push an `OAuthAccount` onto the user's `oauthAccounts` array.
- **`writebackImage`** — typed as `ImageWriteback`; delegates image persistence back to the user document.
- **`findInactiveUnwarned` / `findWarnedStillInactive` / `findReaperSoftDeletedPastGrace`** — inactivity and soft-delete reaping queries using `LAST_ACTIVE_EXPR`.

## Relationships

- **`src/modules/users/model.ts`** — source of `userModel`, `applyUserTransform`, `hashToken`, `TokenType`, and all shared types (`UserDocument`, `Token`, `OAuthAccount`, `UserWire`).
- **`src/infrastructure/persistence/create-repository.ts`** — provides the `createRepository` factory, `toObjectId` helper, and the `Repository` interface that `userRepository` extends.
- **`src/infrastructure/adapters/image.worker.ts`** — supplies the `ImageWriteback` type used to type the `writebackImage` property.
- **`src/modules/users/service.ts`** — primary consumer of `userRepository`; calls credential, token, and inactivity methods.
- **`src/modules/users/module.ts`** — wires the repository into the users module graph.
- **`src/modules/account/tests/…`** (contract + integration) and **`src/modules/api-keys/tests/…`** — exercise the repository through the account and api-keys service flows (login, token rotation, OAuth linking, email collision, soft-delete reaping).
- **`scenarios/users.ts`** — integration scenario harness that drives the repository via the account service.

## Notes

- **Sensitive fields are `select: false` by design.** Any code path that needs `password`, `tokens`, 2FA material, `oauthAccounts`, or `pendingEmail` must go through the `*WithCredentials` / `*WithPendingEmail` helpers. Scattered `.select('+…')` calls are an anti-pattern this file exists to prevent.
- **`active: { $ne: false }` is intentional.** A document with no `active` field is treated as enabled; filtering on `active: true` would silently lock out such legacy rows.
- **`LAST_ACTIVE_EXPR` reads `tokens` despite `select: false`.** `select` trims the *returned* document shape; an aggregation `$expr` filter still sees the stored value. This is safe but non-obvious.
- **Tokens are never stored or queried in plaintext.** Every read/write path calls `hashToken()` first. Forgetting to hash a parameter before passing it to a token method will silently match nothing.
- **`findByToken` uses `$elemMatch` deliberately.** A naive two-path filter (`'tokens.token': …, 'tokens.type': …`) could match a user who holds *different* tokens of the wrong type in the same array.
- **Token spend uses `$pull`, not load-and-save.** The reset-confirm flow saves the same document twice (password, then token); a second `save()` would raise a `VersionError`. `$pull` is atomic and idempotent.
- **`tokenRemoveExpired` retention ≠ rotation grace.** The sweep runs *ahead of* the rotation on the same request; if the cutoff equaled the grace window it would delete the very entry the reuse check was about to read.
- **Explicit type annotation on `userRepository`.** Mongoose's inferred generic type is too large for TS to serialize at an export boundary (TS7056), so the intersection type is written out by hand.
- **`emailOrPendingEmailTaken` is only the request-time half of the collision rule.** The swap-time guarantee comes from the unique indexes `users_email` and `users_pending_email`; the read and the swap can be up to 24 h apart.
- **No `role` filter in `searchable`.** The user document carries no `role` column; role-scoped search requires a two-step resolve through membership rows and is deliberately not implemented in this generic filter.
