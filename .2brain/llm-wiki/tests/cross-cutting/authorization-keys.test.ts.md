---
source: tests/cross-cutting/authorization-keys.test.ts
sha256: 42709ea4beb6c8aefc6fc434d32a08ca3400c6ab0f25ccf376bace57895bcf02
generated_at: 2026-11-14T23:01:49.713777+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/authorization-keys.test.ts

## Purpose

Conformance test that validates the internal consistency of the permission system's data declarations (rules, sets, roles, audiences). It proves that the two shared artefacts read by both permission backends are not internally contradictory: every referenced rule exists, every role only names rules within its own scope, and naming conventions hold. It complements a separate conformance suite that verifies the two backends *agree*; this file ensures the data they both read is sane in the first place.

## Key elements

- **`declared`** — `Set<string>` of every rule ID, used for uniqueness and coverage checks.
- **`audiences`** — `RoleLookup[]` derived from `AUDIENCE_NAMES` / `AUDIENCE_ROLES`, treated as roles alongside `PRESET_ROLES`.
- **`roles`** — combined list (`PRESET_ROLES` + `audiences`) iterated by `it.each` to apply per-role invariants.
- **`describe("the declared rules")`** — asserts rule IDs are unique, follow `action:Subject` format, use PascalCase subjects / lowercase actions, avoid reserved words (`self`, `any`), and that `deniedCode` references a code in `ERROR_CODES`.
- **`describe("the permission sets")`** — asserts set names are unique PascalCase, every rule in a set belongs to that set's module, and no declared rule is left outside all sets.
- **`describe("the preset roles")`** — asserts each role holds only declared rules from its own scope; pins that exactly two tenant roles (`admin`, `system`) are unrestricted; pins that `operator` is unrestricted in platform scope (because platform currently declares exactly one rule).
- **`describe("assertDeclared")`** — verifies the runtime guard throws on undeclared or near-miss rules and resolves correctly for valid ones.

## Relationships

- **`src/kernel/permissions.ts`** — sole module under test. Provides every constant (`PERMISSION_RULES`, `PERMISSION_SETS`, `PRESET_ROLES`, `AUDIENCE_NAMES`, `AUDIENCE_ROLES`, `IMPLIED_ACTIONS`), every helper (`assertDeclared`, `findRule`, `isUnrestrictedRole`, `ruleId`), and the `RoleLookup` type. The test asserts structural invariants *on* that module's exported data.
- **`@api/error-codes`** — imported solely to cross-check that each rule's `deniedCode` is a key actually present in `ERROR_CODES`.

## Notes

- **`system` role is a YAML alias of `admin`.** It is unrestricted for the identical reason and "can never drift" — the test asserts both appear in the unrestricted list but the underlying grant is the same object.
- **"Unrestricted" is a derived property, not a token.** It means "holds every rule declared in its scope." The `operator` / platform test explicitly pins that platform has exactly one declared rule *today*; adding a second platform rule would silently flip `isUnrestrictedRole('operator','platform')` to false and break this test intentionally.
- **Case convention is load-bearing.** Rule IDs are stored in credentials, so `action` must be lowercase and `subject` PascalCase. The test enforces this to prevent a silent mismatch between what is stored and what is looked up.
- **Near-miss rejection.** `assertDeclared('read','Products')` must throw rather than fuzzy-match `Product` — the test guards against a convenience that would mask a typo in a credential.
