---
source: src/modules/users/tests/factories.ts
sha256: 221708e88f095b04addc4a05cb0d3b6e99d2309cfa52db14b23fb58e0c920495
generated_at: 2026-11-08T08:53:16.659996+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/factories.ts

## Purpose

Test-database factories for the users module. It sits one layer above `../factories` (the plain-payload builder) and adds persistence via `userRepository`, role/membership seeding, and password-policy fixtures. Its job is to give every users-module test a single `createUser` entry point and a small set of named password constants so tests never hand-roll credentials.

## Key elements

- **Re-exports from `../factories`** — `makeUser`, `PLAIN_PASSWORD`, `UserOverrides`. The re-export exists so test files import from *this* module only; there is exactly one `makeUser` in the dependency graph.
- **`userRepository` (re-export)** — the live repository binding. Exposed so sibling tests can `jest.spyOn` it; a wrapper function would copy the call and break interception of internal reaches.
- **`REPLACEMENT_PASSWORD`** — a compliant password *different* from `PLAIN_PASSWORD`; used when a test asserts a password change/reset.
- **`MINIMAL_PASSWORD`** — exactly the policy's minimum length.
- **`PASSPHRASE_PASSWORD`** — long, single-class passphrase (valid because policy checks length only).
- **`WEAK_PASSWORD`** — intentionally fails policy; for rejection-path assertions.
- **`createUser(overrides?, role?)`** — persists a user via `userRepository.create(makeUser(...))`. If `role` is a staff role (not an audience name), seeds a tenant membership via `seedMembership`. If `role === 'customer'`, stamps `verifiedAt` with the current date. Audience roles (`customer`, `unverified`) skip membership entirely.
- **`createAdminUser(overrides?)`** — creates the `owner@example.com` / `owneruser` account with **two** memberships: `admin` (tenant-scoped, via `createUser`) and `operator` (tenant-less `platform` scope, via `seedMembership`). Mirrors the seeded deployment `root`.
- **`eraseAsScheduled(user)`** — sets `deletedBy: 'owner'` with `purgeAt` in the past (31-day grace expired), then calls the real `eraseScheduledDeletion` with `systemCallerContext('User')`.
- **`eraseAsInactive(user)`** — sets `deletedBy: 'reaper'`, reloads via `findByIdWithCredentials`, then calls the real `eraseInactive` with `systemCallerContext('User')`.

## Relationships

- **`src/modules/access/tests/factories.ts`** — provides `seedMembership`, called by both `createUser` and `createAdminUser` to write the membership documents that give a user its role.
- **`src/kernel/access/tenant.ts`** — provides `DEPLOYMENT_TENANT_ID`, the tenant identifier stamped on staff-role memberships in `createUser`.
- **`src/kernel/permissions.ts`** — provides `isAudienceName` (to distinguish staff roles from audiences in `createUser`) and `systemCallerContext` (used as the caller in `eraseAsScheduled` / `eraseAsInactive`).
- **`src/domain-primitives/time.ts`** — provides `DAY_MS`, used to compute the 31-day and 1-day offsets in `eraseAsScheduled`.
- **`src/modules/account/tests/contract/*`** and **`src/modules/account/tests/integration/auth-events.test.ts`** — downstream consumers that import these factories to provision users, admins, and erase scenarios before exercising account API or auth-event logic.

## Notes

- `makeUser` is the *only* user builder; this file never constructs a user payload from scratch. It re-exports the builder and then persists its output.
- `createUser`'s `role` parameter is a **string**, not a typed enum. Passing an audience name (`'customer'`, `'unverified'`) is intentional and skips membership; passing any other value is treated as a staff role and will seed a membership.
- `createAdminUser` deliberately grants **two** memberships (`admin` + `operator`). A fixture with only one will pass shop-scoped tests but fail platform/observability tests.
- Passwords are stored in **plain text** in the factory output; the model hashes them on save. Authenticate in tests with `PLAIN_PASSWORD`, not the hashed value.
- `eraseAsScheduled` and `eraseAsInactive` go through the *real* service functions (`eraseScheduledDeletion`, `eraseInactive`), not the repository directly—so any cascade or lock logic they contain is exercised.
