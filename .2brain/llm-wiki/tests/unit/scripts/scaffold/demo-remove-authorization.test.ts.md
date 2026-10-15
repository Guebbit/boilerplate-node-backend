---
source: tests/unit/scripts/scaffold/demo-remove-authorization.test.ts
sha256: d34bd5ed0ae073cb2028f0ce9f22d6ad555df97821763dc94db7f46cd5543ecc
generated_at: 2026-10-15T13:30:29.664005+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/demo-remove-authorization.test.ts

## Purpose

Unit tests for the `demo-remove-authorization` scaffold script. Verifies that, after one or more authorization modules are removed, the shared authorization files (roles and conformance cases) are cleaned up correctly while remaining valid YAML.

## Key elements

- **Fixture helpers** (`write`, `read`) — write/read files under a per-test throwaway temp root created with `mkdtempSync`, ensuring isolation.
- **`beforeEach`** — populates a minimal repo layout: two module `authorization.yaml` files (orders, users), a `shared/contracts/authorization-keys.core.yaml`, a `shared/authorization-roles.yaml`, and a `shared/authorization-conformance.yaml` with anchor/case structure.
- **`afterEach`** — recursively removes the temp root.
- **Test: "reads the removed keys…"** — asserts `readRemovedAuthorization(root, ['orders'])` returns exactly the two `orders.*` keys and the surviving subject `Order`.
- **Test: "drops the grants from a role…"** — asserts `stripRoleGrants` removes `orders.*` grants, leaves `permissions: []` (not a dangling list), and preserves unrelated grants (`users.any.read`).
- **Test: "drops cases about the removed subject…"** — asserts `stripConformanceCases` removes cases whose subject is `Order` and cases whose caller's *only* permissions were removed keys, while keeping cases where the caller also holds a surviving key.

## Relationships

- **scripts/scaffold/demo-remove-authorization.ts** — the module under test. This file imports `readRemovedAuthorization`, `stripRoleGrants`, and `stripConformanceCases` from it and exercises each against on-disk YAML fixtures.

## Notes

- The conformance fixture intentionally includes a YAML anchor (`&admin`) and a comment between the `permissions:` heading and its items to exercise edge cases in the stripping logic.
- The "clerk" role ends up with zero grants after `stripRoleGrants`; the test asserts the output is `permissions: []` (valid, empty list) rather than an empty or malformed structure.
- `removed.subjects` is checked as an exact array (not a set), implying the implementation de-duplicates internally.
- The test for `stripConformanceCases` verifies that a caller holding *both* a removed and a surviving key is kept, but one holding *only* removed keys is dropped.
