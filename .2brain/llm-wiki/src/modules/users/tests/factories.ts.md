---
source: src/modules/users/tests/factories.ts
sha256: 3b9783ebeea89f7e8a03885fb55fcebe8ad6418636738d0cd305cb64eff2bf5f
generated_at: 2026-09-23T19:35:04.097714+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/factories.ts

## Purpose

Test-only database factory for the `users` module. It wraps the plain-payload builder in `../factories` with a persistence step (`userRepository.create`) and role assignment, giving integration and contract tests a single `createUser` / `createAdminUser` entry point that returns a live Mongoose document. It also centralises the full password vocabulary (minimal, legacy, weak, replacement) so policy tests and flow tests share the same fixtures.

## Key elements

- **`createUser(overrides?, role?)`** – Inserts a user via `userRepository.create(makeUser(overrides))`; if `role` is provided, immediately calls `assignRole(user.id, DEPLOYMENT_TENANT_ID, 'tenant', role)`. Omitting `role` leaves the user with no membership row (the anonymous-baseline case).
- **`createAdminUser(overrides?)`** – Builds on `createUser` with `admin` tenant role, then adds a _tenant-less_ `platform` / `operator` role via `assignRole(user.id, null, 'platform', 'operator')`, mirroring the seeded `root` account's dual scope.
- **`REPLACEMENT_PASSWORD`** (`'Replacement1!'`) – A policy-compliant password distinct from `PLAIN_PASSWORD`; use when a test asserts "the password actually changed."
- **`MINIMAL_PASSWORD`** (`'Aa1!aaaa'`) – Exactly at the policy minimum length with one of each required class.
- **`LEGACY_PASSWORD`** (`'correct-horse-battery'`) – Sufficient length but missing complexity classes; represents a pre-policy existing credential (valid as `currentPassword`, never settable).
- **`WEAK_PASSWORD`** (`'weak'`) – Fails the policy; use in rejection-assertion tests.
- **Re-exports** – `makeUser`, `PLAIN_PASSWORD`, `UserOverrides` (from `../factories`) and `userRepository` (from `../repository`). The repository export exists so callers can `jest.spyOn` the live binding rather than a wrapper.

## Relationships

- **`src/kernel/access/tenant.ts`** – Source of `DEPLOYMENT_TENANT_ID`, the tenant ID passed to `assignRole` inside `createUser`.
- **`src/modules/access/index.ts`** – Provides `assignRole`, called by both `createUser` (tenant membership) and `createAdminUser` (platform operator membership).
- **`src/modules/access/service.ts`** – Upstream of the access mutations this factory triggers; tests that verify those mutations depend on the role rows created here.
- **Consumer tests** (`src/modules/account/tests/…`, `src/modules/addresses/tests/…`) – Integration, contract, and unit tests import `createUser` / `createAdminUser` and the password constants to seed their fixtures.

## Notes

- Passwords are **plain text** at the factory level; hashing happens in the Mongoose model on `.save()`/`.create()`. Tests authenticate with `PLAIN_PASSWORD`, not the stored hash.
- Defaulted model fields are intentionally **left unset** in `makeUser` so `createUser` exercises the real schema defaults rather than a factory-supplied value.
- `createAdminUser` assigns **two** roles (tenant `admin` + tenant-less `platform operator`). A fixture with only one will pass shop-scoped tests but fail observability/platform-scoped ones.
- `userRepository` is exported as the raw module binding specifically so `jest.spyOn` intercepts internal calls; a wrapper function would copy the binding and defeat interception.
- `LEGACY_PASSWORD` is valid only as an _existing_ credential (`currentPassword`), never as a new one—matching the `Password` vs `PasswordNew` distinction in `openapi.yaml`.
