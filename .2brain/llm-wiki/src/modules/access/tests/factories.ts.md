---
source: src/modules/access/tests/factories.ts
sha256: 0a05ddac4af5785cb957b8896b1088cb14ca877a3b46206db8b95f8d346fed62
generated_at: 2026-11-08T03:58:32.028313+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/factories.ts

## Purpose

Test-side entry point into the `access` module's storage and audit surfaces. Sibling modules' tests (users, account, payments, returns, api-keys) cannot import `../model` or `../audit` directly due to import-boundary rules; this file re-exports those internals and provides a granter-less `seedMembership` helper so those tests can seed roles and assert on real audit action names without reaching across the boundary.

## Key elements

- **`membershipModel`** (re-export from `../model`) — The membership Mongoose model. Sibling tests spy on its write methods to force a role-grant failure mid-flow.
- **`accessAuditActions`** (re-export from `../audit`) — The audit action name constants. Sibling tests assert the *real* recorded action string rather than hard-coding a literal.
- **`seedMembership(userId, tenantId, scope, role)`** — Places a user in a role with no granter context (for seeders, migrations, fixtures). Validates the role against the model via `validateGrant(scope, role, [ASSIGN_RULE])`, then persists through `membershipRepository.upsertRole`. A typo'd role fails at validation rather than silently seeding a useless membership. `tenantId` may be `null` for platform-scope roles.

## Relationships

- **`src/modules/access/model.ts`** — Source of the re-exported `membershipModel` and the `MembershipDocument` return type.
- **`src/modules/access/audit.ts`** — Source of the re-exported `accessAuditActions`.
- **`src/modules/access/services/grants.ts`** — Provides `ASSIGN_RULE` and `validateGrant` used inside `seedMembership`.
- **`src/modules/access/repository.ts`** — `seedMembership` delegates persistence to `membershipRepository.upsertRole`.
- **`src/modules/users/tests/factories.ts`** — Sibling factory in the same pattern (test-side bridge into the `users` module).
- **`src/modules/users/tests/integration/admin-user-grant-atomicity.test.ts`** — Spies on `membershipModel` (this re-export) to force a grant write to fail.
- **`src/modules/users/tests/integration/hierarchy.test.ts`** — Consumes `seedMembership` to set up parent/child role hierarchies.
- **`scenarios/accounts.ts`** — Seeder that calls `seedMembership` to establish initial platform/tenant roles.
- **Other sibling integration tests** (`account/idle-timeout`, `api-keys`, `payments/service`, `returns/*`) — Import `accessAuditActions` to assert the correct audit action name is recorded.

## Notes

- This file exists *because* of the import boundary documented in `docs/reference/tests.md`; it is not a general-purpose fixture factory. It is only meaningful inside test files of sibling modules.
- `seedMembership` deliberately has **no** granter parameter. `assignRole` in the service layer requires a granter because an optional one previously made "no granter" mean "skip authorization checks." This helper sidesteps that by using the lower-level `upsertRole` directly, after validating the role name.
- The `Promise.resolve().then(…)` chain is not async/await; it mirrors the style of the rest of the module and keeps the call chain flat.
