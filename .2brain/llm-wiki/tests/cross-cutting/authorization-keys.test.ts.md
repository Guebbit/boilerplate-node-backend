---
source: tests/cross-cutting/authorization-keys.test.ts
sha256: d4e236c2c9fc979919fefa37cfcd2cdcf18173f638763d468cbaba08cd5f5c98
generated_at: 2026-10-29T06:43:47.975651+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/authorization-keys.test.ts

## Purpose

Validates the internal consistency of the permission vocabulary that every backend reads. Where the adjacent conformance suite proves two backends *agree*, this suite proves the shared artefacts (`PERMISSION_RULES`, `PERMISSION_SETS`, `PRESET_ROLES`, `AUDIENCE_ROLES`) are not self-contradictory: every ID is well-formed, every rule is reachable, every role references only declared rules, and the runtime guard `assertDeclared` rejects unknown combinations.

## Key elements

- **`roles` (local const)** — Merges `PRESET_ROLES` with `AUDIENCE_NAMES` mapped into `RoleLookup[]` shape so both populations are exercised by the same assertions.
- **`describe('the declared rules')`** — Checks `PERMISSION_RULES` for unique IDs, correct `action:Subject` id format, PascalCase subject / lowercase action casing, absence of `self`/`any` tokens, `deniedCode` matching a real `ERROR_CODES` key, and `IMPLIED_ACTIONS` key/value shape.
- **`describe('the permission sets')`** — Asserts `PERMISSION_SETS` names are unique PascalCase, every bundled rule belongs to the set's own module, and no declared rule is left outside all sets.
- **`describe('the preset roles')`** — For each role (preset + audience): every permission ID passes `assertDeclared`, every rule's scope matches the role's scope. Pins the unrestricted-role invariant (`admin`, `system` in tenant; `operator` in platform, today) using `isUnrestrictedRole`.
- **`describe('assertDeclared')`** — Verifies the runtime guard throws on undeclared and near-miss combinations and returns the correct rule for a valid one.

## Relationships

- **`src/kernel/permissions.ts`** — Sole subject under test. Imports the full public surface: `AUDIENCE_NAMES`, `AUDIENCE_ROLES`, `assertDeclared`, `findRule`, `IMPLIED_ACTIONS`, `isUnrestrictedRole`, `PERMISSION_RULES`, `PERMISSION_SETS`, `PRESET_ROLES`, `ruleId`, and the `RoleLookup` type.
- **`@api/error-codes`** — Provides `ERROR_CODES` to cross-check that each rule's `deniedCode` is a key actually declared in the API error catalogue.

## Notes

- **ID casing is load-bearing.** Actions are lowercase, subjects are PascalCase because the composite string is persisted in user credentials; the tests pin this so a rename is a visible breaking change.
- **`operator` unrestricted is a snapshot, not a guarantee.** Platform scope currently declares exactly one rule, so holding it trivially satisfies "every platform rule." The test asserts `toHaveLength(1)` so that adding a second platform rule forces a conscious decision.
- **`system` is unrestricted by alias, not by listing.** It references `admin`'s sets via a YAML alias, so it can never drift; the test encodes that structural fact.
- **`assertDeclared` is the runtime half.** These tests are the design-time half; together they close the loop on "a role grants nothing because its IDs were never declared."
