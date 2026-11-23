---
source: scenarios/personas-schema.ts
source_sha256: 1764db49f2edb96f8308160a008cc5f9552a131151191484b5b8be1c8001e068
context_sha256: 189b6b17f8dba3ea748aa85e81f6cc8e25b0843cbd145bc5cabd4668f04f0594
generated_at: 2026-11-22T01:44:12.191316+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/personas-schema.ts

## Purpose
Defines the Zod schema for `shared/scenarios/personas.yaml` and is the single place that reads that file. It describes the 13 demo login accounts, keyed by the names the paired frontend's journeys use. It lives under `scenarios/` rather than `src/infrastructure/` because infrastructure must not import `scenarios/`.

## Key elements
- `PERSONA_NAMES`: the 13 account names (`admin`, `user`, `editor`, `moderator`, `unverified`, `twoFactor`, `pendingEmail`, `banned`, `secondShopper`, `manager`, `warehouse`, `support`, `operator`). The array order is the order the accounts are seeded in.
- `PersonaName`: the union type derived from `PERSONA_NAMES`.
- `personasSchema`: a strict Zod object with two fields:
  - `staffTotpSecret`: the base32 secret every authenticator-armed account is seeded with.
  - `accounts`: a strict object with exactly one account entry per persona name.
- Each account (internal schema) has `email`, `username`, `defaultPassword`, `memberships` and `state`.
  - `memberships`: a list of `{ scope: 'tenant' | 'platform', role }`.
  - `state`: `verified`, `active`, `twoFactor`, `authenticator`, `pendingEmail` (nullable email) and `analyticsConsent`.
- `personas`: the parsed file, produced by `loadSharedRules('personas', personasSchema, 'scenarios')`.

## Relationships
- `src/infrastructure/config/shared-rules/load.ts`: provides `loadSharedRules`, which this file calls at import time to read and validate the YAML.
- `scripts/contracts/generate-shared-rule-schemas.ts`: exports `personasSchema` as JSON Schema.
- `tests/unit/scenarios/personas.test.ts`: tests the schema and data. The role names in `memberships` are checked against the roles file by that test.
- `scenarios/accounts.ts`, `scenarios/users.ts` and `scenarios/config.ts`: sibling scenario modules in the same dependency cluster. The visible content does not show how they use this file's exports.

## Notes
- All objects are `strictObject`, so unknown keys in the YAML are rejected.
- `memberships[].role` is only validated as a non-empty string here. The check against real roles happens in the test.
- Loading happens as a side effect of importing the module.
