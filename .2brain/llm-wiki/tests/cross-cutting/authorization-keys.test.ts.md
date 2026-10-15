---
source: tests/cross-cutting/authorization-keys.test.ts
sha256: 8d65ed4131680a02929453e2053759356e2b985668472ecbd86cdd5b98108b28
generated_at: 2026-10-15T12:35:55.586644+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/authorization-keys.test.ts

## Purpose

Integrity guard for the permission model's source data. It asserts that the two shared artefacts (the declared permission keys and the preset roles) are internally consistent: every key a role grants actually exists, keys follow their naming convention, scopes are respected, and the "unrestricted role" invariant holds exactly where expected. It does not compare backends (a neighbouring conformance suite does that); it catches nonsense in the data itself before anything runs.

## Key elements

- **`describe('the declared keys')`** — validates every entry in `PERMISSION_KEYS`:
  - `scopeOfKey(key)` matches the key's own `scope` field.
  - Key strings are unique.
  - Each key ends with its declared `action`.
  - Key strings match `/^[a-z][.a-z]*[a-z]$/` (lower-case, dotted).
  - Any `deniedCode` on a key is a real property of `ERROR_CODES`.

- **`describe('the preset roles')`** — iterates `PRESET_ROLES` plus `ANONYMOUS_ROLE`:
  - Every permission a role holds passes `assertDeclared` (i.e. is in the declared set).
  - Every permission a role holds belongs to the role's own scope.
  - Exactly two TENANT-scope roles are unrestricted: `admin` and `system` (the latter aliases `admin` via YAML in `authorization-roles.yaml`).
  - Pins that `operator` is currently unrestricted in platform scope *only because* exactly one platform key is declared; a second platform key would break the assertion and flag the change deliberately.

- **`describe('assertDeclared')`** — unit-tests the runtime guard: it throws `/not declared/` for unknown keys and for plausible near-misses (e.g. `product.read` vs `products.read`).

## Relationships

- **`src/kernel/permissions.ts`** — sole subject under test. The test imports `PERMISSION_KEYS`, `PRESET_ROLES`, `ANONYMOUS_ROLE`, `scopeOfKey`, `isUnrestrictedRole`, `assertDeclared`, and the `RoleLookup` type from this module, then cross-checks their internal coherence against each other and against `@api/error-codes`.

## Notes

- **Unrestricted is derived, not tokened.** `isUnrestrictedRole(name, scope)` means "holds every key currently declared in that scope." A scope with one key makes its sole holder trivially unrestricted; the test for `operator` exists to make that tautology visible and to flag it the moment a second platform key is added.
- **Key strings are persisted.** The lower-case-dotted regex is enforced because renaming a key is a data migration, not a refactor; this test is the gate that catches accidental casing drift.
- **`system` role is an alias, not a separate grant list.** It holds `admin`'s list via a YAML alias in `authorization-roles.yaml`, so it can never drift. The test asserts both names appear in the unrestricted list to lock that coupling.
- **Sibling conformance suite.** The file header distinguishes this from a neighbouring test that proves two backends agree. This one is upstream of that concern: it proves the data they both read is not self-contradictory.
