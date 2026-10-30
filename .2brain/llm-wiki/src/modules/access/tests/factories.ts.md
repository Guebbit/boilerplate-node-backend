---
source: src/modules/access/tests/factories.ts
sha256: 0a05ddac4af5785cb957b8896b1088cb14ca877a3b46206db8b95f8d346fed62
generated_at: 2026-10-29T02:24:09.053098+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/tests/factories.ts

## Purpose

Test-side facade that exposes `access`'s internals (membership rows, audit action names, and a granter-less role write) to **sibling modules'** tests. Siblings import from this file instead of `../model` or `../audit` directly, because their import boundaries forbid reaching into another module's internals (see `docs/reference/tests.md`).

## Key elements

- **`membershipModel`** (re-export from `../model`) — the membership row model; a sibling spies on its `upsertRole` write to force a role grant to fail mid-test.
- **`accessAuditActions`** (re-export from `../audit`) — the named audit actions `access` records, so a sibling can assert against the real string rather than hard-coding a duplicate.
- **`seedMembership(userId, tenantId, scope, role)`** — validates the role against the model (`validateGrant` with `[ASSIGN_RULE]`) then upserts it via `membershipRepository.upsertRole`. Intentionally takes **no granter**; meant for seeders, migrations, or fixtures where there is no caller to escalate from. A typo in the role name fails loudly at validation time rather than seeding a useless membership.

## Relationships

- **`src/modules/access/model.ts`** — source of `MembershipDocument` type and `membershipModel` re-export.
- **`src/modules/access/audit.ts`** — source of `accessAuditActions` re-export.
- **`src/modules/access/repository.ts`** — provides `membershipRepository.upsertRole` used by `seedMembership`.
- **`src/modules/access/services/grants.ts`** — provides `ASSIGN_RULE` and `validateGrant` used by `seedMembership`.
- **`src/modules/users/tests/factories.ts`** — sibling factory file following the same pattern for the `users` module.
- Consumed by integration tests across `accounts`, `api-keys`, `payments`, `returns`, and `users` modules to set up or spy on access state without crossing import boundaries.

## Notes

- The import-boundary indirection is the whole reason this file exists; do not add production-logic imports here — it is strictly a test bridge.
- `seedMembership` deliberately omits the granter that `assignRole` requires; this is a design choice (fixture context has no caller), not an oversight.
- The role string is validated at call time, so a wrong role in a fixture is a test failure, not a silent no-op membership.
