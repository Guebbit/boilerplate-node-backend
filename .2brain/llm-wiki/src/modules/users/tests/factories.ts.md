---
source: src/modules/users/tests/factories.ts
sha256: 76bf48c3fe04bfc1bdb3a1f1c093d0b7699d98c2c59f3fc5e8cac2a0109f0725
generated_at: 2026-10-29T06:19:40.506239+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/factories.ts

## Purpose

Test factory for the users module that persists users into the test database. It wraps the plain-payload `makeUser` from `../factories` (so there is exactly one builder) and adds DB insertion, role/membership seeding, and password-vocabulary constants. It exists so account and access tests can create realistic, persisted user fixtures without duplicating persistence logic.

## Key elements

- **`createUser(overrides?, role?)`** — Inserts a user via `userRepository.create`. If `role` is a staff name (not an audience), it also seeds a TENANT membership via `seedMembership`. If `role === 'customer'`, sets `verifiedAt` to now unless overridden. Returns the Mongoose `UserDocument`.
- **`createAdminUser(overrides?)`** — Creates the demo `root` account (`owner@example.com` / `owneruser`). Seeds two memberships: `admin` in the deployment tenant, and `operator` in the tenant-less `platform` scope.
- **`eraseAsScheduled(user)`** — Marks the document as owner-scheduled with an expired grace period (`deletedAt` −31 d, `purgeAt` −1 d), then calls the real `eraseScheduledDeletion` with a system caller context.
- **`REPLACEMENT_PASSWORD`** — A compliant password intentionally different from `PLAIN_PASSWORD`; used in change/reset tests so a no-op cannot pass.
- **`MINIMAL_PASSWORD`** / **`PASSPHRASE_PASSWORD`** / **`WEAK_PASSWORD`** — Policy-boundary fixtures: minimum-length valid, long-lowercase valid, and outright-rejecting respectively.
- **Re-exports** — `makeUser`, `PLAIN_PASSWORD`, `UserOverrides` (from `../factories`) and the live `userRepository` binding (for `jest.spyOn` interception).

## Relationships

- **`@domain-primitives/time`** — imports `DAY_MS` to compute the 31-day and 1-day offsets in `eraseAsScheduled`.
- **`@kernel/access/tenant`** — imports `DEPLOYMENT_TENANT_ID` to scope the TENANT membership seeded by `createUser` and `createAdminUser`.
- **`@kernel/permissions`** — imports `isAudienceName` (to distinguish audiences from staff roles in `createUser`) and `systemCallerContext` (caller identity for `eraseScheduledDeletion`).
- **`@modules/access/tests/factories`** — imports `seedMembership` to write role memberships after the user document exists.
- **Account contract & integration tests** (`src/modules/account/tests/contract/*`, `src/modules/account/tests/integration/*`) — primary consumers; they call `createUser`, `createAdminUser`, `eraseAsScheduled`, and the password constants to build their fixtures.
- **`../factories`** (sibling, not in graph list) — the plain-payload `makeUser` and `UserOverrides` type that this file re-exports and calls internally.

## Notes

- Passwords are stored as plain text until the Mongoose model hashes them on save; authenticate with `PLAIN_PASSWORD`.
- Defaulted schema fields are deliberately left unset in the payload so `createUser()` exercises the real Mongoose defaults.
- `userRepository` is exported as the **live binding**, not a wrapper, so `jest.spyOn` on it intercepts calls made internally by this module.
- `createAdminUser` seeds two memberships because the seeded `root` in deployment holds both scopes; a single-role fixture would silently pass shop tests but fail observability tests.
- `unit/factories.test.ts` is the guard that proves each password constant still satisfies (or violates) the current policy when it changes.
