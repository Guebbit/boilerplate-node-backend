---
source: src/modules/access/tests/factories.ts
source_sha256: 272e60ec6cdbd7f574a52285a06e6bc7eef706bed6387e2937b6e1b7edbc280f
context_sha256: effc4e3a987d9b4c1f2d1ee261634188cddc5c2c61b3928d537267cf118a930d
generated_at: 2026-11-22T03:18:16.565435+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/tests/factories.ts

## Purpose
The test-side entry point into the `access` module's storage, meant for other modules' tests. Sibling modules have an import boundary that forbids reaching `../model` or `../audit` directly, so this file re-exports what they need and provides a helper to seed memberships.

## Key elements
- `membershipModel` (re-export from `../model`): the membership rows. A sibling test can spy on a write here to force a role grant to fail.
- `accessAuditActions` (re-export from `../audit`): the audit action names `access` records, so tests can assert on the real names.
- `seedMembership(userId, tenantId, scope, role)`: places a user in a tenant, or on the platform when `tenantId` is `null`, with a role. It returns a `Promise<MembershipDocument>`. It validates the role with `validateGrant(scope, role, [ASSIGN_RULE])` and then calls `membershipRepository.upsertRole` with the validated role.

## Relationships
- `src/modules/access/model.ts`: source of the `membershipModel` re-export and the `MembershipDocument` type.
- `src/modules/access/audit.ts`: source of the `accessAuditActions` re-export.
- `src/modules/access/repository.ts`: exports `membershipRepository`, whose `upsertRole` does the write in `seedMembership`.
- `src/modules/access/services/grants.ts`: supplies `validateGrant` and `ASSIGN_RULE`.
- The listed integration tests (access, account idle-timeout, api-keys, payments, returns, users) and `src/modules/users/tests/factories.ts` are neighbors in the dependency graph. They are the sibling-module test consumers this file is written for.

## Notes
- `seedMembership` takes no granter, unlike `assignRole`, which requires one. The source comment says an optional granter would have made "no granter" mean "no check". It is intended for seeders, migrations and fixtures, which have nobody to escalate from.
- The role is still validated against the model, so a typo in a fixture throws instead of seeding a member with no permissions.
- Validation runs inside a `Promise.resolve().then(...)` chain, so a validation failure shows up as a rejected promise, not a synchronous throw.
