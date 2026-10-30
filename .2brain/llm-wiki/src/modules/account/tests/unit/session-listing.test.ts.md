---
source: src/modules/account/tests/unit/session-listing.test.ts
sha256: c484bd5d6887fba45e20fcd2a6bf82202cb766d414a4e278bb53d7dd6e190d0a
generated_at: 2026-10-29T03:06:18.512963+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-listing.test.ts

## Purpose
Unit tests for the session-listing module (`@modules/account/session/listing`). Verifies that `newestPerFamily` deduplicates rotation-race rows and that `listSessions` publishes the correct shape, marks the caller's family as current, omits absent optional fields, enforces the account token epoch, and applies the staff idle-timeout rule. The repository's `listLive` is fully stubbed; query construction is left to the integration suite.

## Key elements
- **`row(familyId, overrides)`** – local factory that builds a `SessionRow` fixture with a fresh `_id` (ObjectId timestamp), fixed user id, and defaults; used throughout every `it` block.
- **`newestPerFamily`** (imported from `listing.ts`) – tested for: keeping exactly one row per `familyId` (the later-written one by `_id`, regardless of input position) and preserving the caller-supplied order of families.
- **`listSessions`** (imported from `listing.ts`) – tested for:
  - Publishing `id`, `createdAt`, `expiration`; marking the caller's family `current: true`.
  - Marking the family current even when the caller's credential is the *older* (rotated-away) row.
  - Marking nothing current when the caller passes `undefined` as its token.
  - Including `lastUsedAt` / `device` only when the row carries them (absent, not `null`).
  - Dropping rows whose `authTime` predates the account's `tokensValidAfter` epoch; keeping rows with no `authTime`.
  - Hiding a staff (tenant-role) session past the idle limit while keeping the same row for a shopper.
- **Mocks** – `sessionRepository.listLive`, `userService.findAuthenticatableById`, and `accessService.rolesOf` are all replaced with `jest.fn()` via `jest.mock` partial overrides; reset in `beforeEach`.

## Relationships
- **`@modules/account/session/listing`** – the module under test; provides `listSessions` and `newestPerFamily`.
- **`@modules/account/repository`** – `sessionRepository.listLive` is the sole data source; mocked out so only the listing logic is exercised.
- **`@modules/users`** – `userService.findAuthenticatableById` supplies the account (including `tokensValidAfter`) for epoch checks.
- **`@modules/access`** – `accessService.rolesOf` determines whether the caller holds a staff role, which activates the idle-timeout filter.
- **`@infrastructure/security/hash-token`** – `hashToken` is used to build realistic token-hash values in fixtures and to simulate the caller's credential.
- **`@tests/stub`** – `asStub` casts real objects to `jest.Mock`-typed doubles so the test can assert on and reassign mock implementations without `any`.

## Notes
- Deduplication in `newestPerFamily` is by **`_id` (ObjectId embedded timestamp)**, not by `startedAt`. A "newer" row is simply the one with the lexicographically greater ObjectId.
- The "current" flag is a **family-level** property: if the caller's token hash matches *any* row in the family, the family is marked current, even when the caller holds the older (rotated-away) row.
- The staff idle-timeout test depends on `accessService.rolesOf` returning a non-null `tenant`; the default `beforeEach` reset sets both roles to `null`, so only the dedicated `it` block overrides this.
- The file-level docstring explicitly scopes out store-query correctness ("what `listLive` selects is the integration suite's"), so a passing suite here says nothing about the repository's filtering logic.
