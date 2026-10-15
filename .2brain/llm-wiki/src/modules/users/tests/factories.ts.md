---
source: src/modules/users/tests/factories.ts
sha256: 1ac7925c76d91541587f147a6632904f7026edf3986890bf5ae812e25b2aaaed
generated_at: 2026-10-15T12:12:53.252197+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/factories.ts

## Purpose

Test-database persistence layer for user fixtures. It re-exports the plain-payload builder (`makeUser`) from `../factories` and adds `createUser` / `createAdminUser`, which actually write rows to the Mongoose test database and optionally attach tenant/platform role memberships. Keeping this separate from the payload builder guarantees a single `makeUser` implementation while giving tests a one-call helper that returns a fully persisted, role-assigned `UserDocument`.

## Key elements

- **`createUser(overrides?, role?)`** — Inserts a user via `userRepository.create(makeUser(overrides))`. If `role` is provided, immediately calls `assignRole` to grant a tenant membership (`DEPLOYMENT_TENANT_ID`). Returns the Mongoose `UserDocument`.
- **`createAdminUser(overrides?)`** — Creates the canonical `root` operator account (`owner@example.com` / `owneruser`). Assigns **two** memberships: `admin` under the tenant (via `createUser`'s `role` param) and `operator` under `platform` (tenant-less, `tenantId: null`). Mirrors the seeded deployment's root.
- **`REPLACEMENT_PASSWORD`** (`'Replacement1!'`) — A policy-compliant password deliberately different from `PLAIN_PASSWORD`, for change/reset tests.
- **`MINIMAL_PASSWORD`** (`'Aa1!aaaa'`) — Shortest password the policy accepts.
- **`PASSPHRASE_PASSWORD`** (`'correct-horse-battery'`) — Long, single-class passphrase; exercises the "length-only" policy path.
- **`WEAK_PASSWORD`** (`'weak'`) — Policy-failing password for rejection assertions.
- **Re-exports** — `makeUser`, `PLAIN_PASSWORD`, `UserOverrides` (from `../factories`) and `userRepository` (from `../repository`, exposed so callers can `jest.spyOn` the live binding rather than a wrapper copy).

## Relationships

- **`src/kernel/access/tenant.ts`** — Supplies `DEPLOYMENT_TENANT_ID`, the tenant scope used when `createUser` grants a role membership.
- **`src/modules/access/index.ts` / `src/modules/access/service.ts`** — Provides `assignRole`, the function both `createUser` and `createAdminUser` call to attach role memberships. The `platform`-scoped, tenant-less `operator` role in `createAdminUser` follows the same pattern as `seedAccessModel`.
- **`src/modules/account/tests/contract/*` and `src/modules/account/tests/integration/*`** — Downstream consumers that import these factories (and the re-exported `PLAIN_PASSWORD`, `userRepository`) to seed authenticated users before exercising auth flows. `contract/support.ts` likely composes or extends these helpers within the contract-test harness.

## Notes

- **Single `makeUser` rule:** This file must not re-implement payload construction. If a new default field is needed, change `../factories`; this file only calls it.
- **Defaulted fields left unset:** `makeUser` intentionally omits fields the schema defaults, so `createUser` exercises real DB defaults rather than shadowing them.
- **`REPLACEMENT_PASSWORD` ≠ `PLAIN_PASSWORD` is a deliberate invariant.** Reusing the same string makes "password was changed" tests pass on a no-op. `unit/factories.test.ts` is the regression guard for each password constant's role.
- **`userRepository` export exists for `jest.spyOn`.** A wrapper function would copy the call target, not the binding, so it cannot intercept internal calls. Prefer a named helper (`createUser`, etc.) unless you specifically need to intercept the repository.
- **`createAdminUser` grants two roles, not one.** Omitting the `operator`/`platform` membership produces a fixture that passes shop-scoped tests but fails observability/platform-scoped ones.
