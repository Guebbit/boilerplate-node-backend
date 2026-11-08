---
source: tests/cross-cutting/authorization-keys.test.ts
sha256: d4e236c2c9fc979919fefa37cfcd2cdcf18173f638763d468cbaba08cd5f5c98
generated_at: 2026-11-08T09:24:23.367692+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/authorization-keys.test.ts

## Purpose

Conformance test that validates the internal consistency of the shared permission artefacts (rules, sets, preset roles) loaded by `src/kernel/permissions.ts`. It answers "are the files they both read not nonsense?" — ensuring no preset role silently grants nothing, no rule is orphaned, and naming conventions are enforced so that rule IDs stored in credentials remain stable.

## Key elements

- **`declared`** — `Set` of all rule IDs, used to check uniqueness and completeness.
- **`audiences` / `roles`** — combined `RoleLookup[]` (preset roles + audience-derived roles) fed into parameterised `it.each` cases.
- **`describe('the declared rules')`** — asserts rule-ID uniqueness, `action:Subject` id format, PascalCase subjects / lowercase actions, absence of reserved words (`self`, `any`), valid `deniedCode` references, and `IMPLIED_ACTIONS` shape.
- **`describe('the permission sets')`** — asserts set-name uniqueness and casing, that every bundled rule belongs to the set's own module, and that no declared rule is left un-bundled.
- **`describe('the preset roles')`** — asserts every role's permissions reference declared rules within the role's own scope; pins that exactly two tenant roles are unrestricted (`admin`, `system`); documents that `operator` is unrestricted in platform scope *only* because platform has one declared rule today.
- **`describe('assertDeclared')`** — verifies the runtime guard rejects undeclared and near-miss `(action, subject)` pairs, and returns the matching rule for a valid one.

## Relationships

- **`src/kernel/permissions.ts`** — the module under test. All data constants (`PERMISSION_RULES`, `PERMISSION_SETS`, `PRESET_ROLES`, `AUDIENCE_ROLES`, `IMPLIED_ACTIONS`) and functions (`assertDeclared`, `findRule`, `isUnrestrictedRole`, `ruleId`) are imported from here; this file is the design-time mirror of that module's invariants.
- **`@api/error-codes`** — provides `ERROR_CODES`, checked against to confirm every rule's `deniedCode` is a real, declared error code.

## Notes

- Naming conventions (PascalCase subject, lowercase action) are enforced *here* because rule IDs are persisted in credentials; a rename is a breaking change, so the test makes that a hard failure.
- `system` is unrestricted not by independent logic but by a YAML alias to `admin`'s sets; the test pins that so a silent de-alias is caught.
- `operator`'s "unrestricted in platform" status is explicitly noted as a *derived, time-sensitive* fact (true only while platform declares exactly one rule). The test exists to make adding a second platform rule a deliberate, noticed change rather than a silent loss of the invariant.
- This file is the **design-time** guard; `assertDeclared` is the **runtime** guard. They encode the same rule at different points in the lifecycle.
