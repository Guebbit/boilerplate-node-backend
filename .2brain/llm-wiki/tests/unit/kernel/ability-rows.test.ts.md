---
source: tests/unit/kernel/ability-rows.test.ts
sha256: c6913f8028682306439e3e491b28ee2ae7cbf7a95def3715b956e5560235233f
generated_at: 2026-11-08T10:25:59.962061+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/ability-rows.test.ts

## Purpose

Unit tests for `permitsOnRows`, the per-row permission check that answers "may this caller update or delete **this** row?" for the `Example` module. It verifies that row-level authorization (ownership via `userId` match, admin bypass, rule-absence denial, and tenant isolation) behaves as the `authorization.yaml` rules dictate.

## Key elements

- **`rowOf(userId)`** — local helper returning a minimal row shape (`{ userId, status: 'draft' }`) that mirrors the `Example` module's row model.
- **`describe('permitsOnRows', …)`** — four test cases:
  - Owner can update/delete their own row but not another's.
  - Admin role can act on any row regardless of ownership.
  - A caller with no matching rule for the subject gets `{ update: false, delete: false }`.
  - A `tenantId` embedded in the row is ignored; the caller's own tenant governs.

## Relationships

- **`src/kernel/ability.ts`** — SUT. Exports `permitsOnRows(caller, moduleName, actions)` which this file imports and exercises.
- **`tests/support/callers.ts`** — Provides `callerAs(role, id)`, a shared factory that builds caller objects (role + identity) used throughout the test suite.

## Notes

- The leading `// requires-module: example` comment signals that the tests depend on an `authorization.yaml` defining the `Example` module's rules; running them in isolation without that fixture will fail.
- The tenant-isolation test deliberately spreads a foreign `tenantId` onto the row to assert the API never trusts row-supplied tenancy — the caller's context always wins.
- Action lists are passed as arrays (`['update', 'delete']`); the return value is a plain object keyed by action name, making the contract easy to assert with `toEqual`.
