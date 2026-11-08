---
source: tests/unit/scenarios/personas.test.ts
sha256: 1a52451c5aa930036ffaa3acc2de3fc022cdf03362e571bab96421cf29e5b7de
generated_at: 2026-11-08T10:30:29.831990+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/personas.test.ts

## Purpose

Cross-validates the persona account definitions (from the personas schema) against the shared authorization-roles file, ensuring role references are legal, authenticator state is consistent with staff membership, and account identifiers are unique.

## Key elements

- **`definedRoles`** – A `Set<string>` of `scope:name` pairs, parsed at module load from `shared/authorization-roles.yaml` (read via `readFileSync` + `yaml.parse`). Serves as the whitelist for membership checks.
- **`memberships`** – A flat `string[]` of `scope:role` pairs collected from every account in `personas.accounts` (iterated over `PERSONA_NAMES`).
- **`describe('shared/scenarios/personas.yaml')`** – Contains three assertions:
  - *Role validity*: every membership string exists in `definedRoles`.
  - *Authenticator ↔ staff alignment*: accounts with `state.authenticator` set are exactly those with ≥ 1 membership.
  - *Identifier uniqueness*: `email` and `username` are each unique across all accounts.

## Relationships

- **`scenarios/personas-schema.ts`** – Provides `PERSONA_NAMES` (list of account keys) and `personas` (the full account structure including `memberships` and `state.authenticator`). This test is the primary consumer that enforces referential integrity on that schema.
- **`shared/authorization-roles.yaml`** (data dependency, not a code import) – The source of truth for which roles exist; this test ensures personas never reference an undefined role.

## Notes

- `definedRoles` and `memberships` are computed at **module top level**, not inside test callbacks. The YAML file is read once when the module is first imported; if the file is missing or malformed the error surfaces as an import-time crash rather than a test failure.
- Test 2's title says "staff role" but the assertion is simply `memberships.length > 0` — it does not filter by a specific role name. Any membership qualifies.
- The `describe` label references `shared/scenarios/personas.yaml`, but the actual data comes from the `personas` object in `personas-schema.ts`; the YAML file is an upstream source for that schema, not read directly by this test.
