---
source: scenarios/personas-schema.ts
sha256: 4bb1dd63ac5ef807448234e44b54cedd2af957f5d9693ffe4ad6082f7c9b9ae8
generated_at: 2026-10-29T01:23:59.645989+00:00
model: ollama:qwen3.8:27b
---

# scenarios/personas-schema.ts

## Purpose

Defines the Zod schema and a single parse of `shared/scenarios/personas.yaml`, the file that seeds 13 demo login accounts keyed by the persona names the paired frontend's journeys reference. It lives in `scenarios/` (not `src/infrastructure/`) because infrastructure code is forbidden from importing anything under `scenarios/`.

## Key elements

- **`PERSONA_NAMES`** — `as const` array of the 13 account names in seed order (`admin`, `user`, `editor`, `moderator`, `unverified`, `twoFactor`, `pendingEmail`, `banned`, `secondShopper`, `manager`, `warehouse`, `support`, `operator`).
- **`PersonaName`** — Union type of the 13 name literals, derived from `PERSONA_NAMES`.
- **`personasSchema`** — Top-level `z.strictObject` requiring `staffTotpSecret` (a base32 string) and an `accounts` object that maps every `PERSONA_NAMES` entry to an `accountSchema` instance. All levels are strict; no unknown keys are tolerated.
- **`Persona`** — `z.infer` of the per-account schema (`email`, `username`, `defaultPassword`, `memberships[]`, `state`).
- **`personas`** — The parsed YAML value, obtained via `loadSharedRules('personas', personasSchema, 'scenarios')`. This is the single place the file is read.

## Relationships

- **`src/infrastructure/config/shared-rules/load.ts`** — Provides `loadSharedRules`, which reads the YAML file, validates it against `personasSchema`, and returns the typed result. This is the only runtime import in the file.
- **`scripts/contracts/generate-shared-rule-schemas.ts`** — Consumes `personasSchema` to emit a JSON Schema contract for the `personas.yaml` file.
- **`scripts/docs/generate-persona-tables.ts`** — Reads the parsed `personas` value to generate human-readable documentation tables.
- **`scenarios/accounts.ts`**, **`scenarios/users.ts`**, **`scenarios/config.ts`** — Downstream scenario scripts that import `personas` / `PersonaName` to wire up account creation, user-state setup, and scenario configuration.
- **`tests/unit/scenarios/personas.test.ts`** — Unit-tests the schema (e.g., validating the role-name cross-check against the roles file) and the parsed data.

## Notes

- **Strict at every level.** `z.strictObject` is used for the top level, each account, `state`, and `membership`. Adding a new field to the YAML without updating the schema will cause a validation error, not a silent ignore.
- **Order matters.** `PERSONA_NAMES` array order is the seed order for accounts. Reordering the array changes the order in which accounts are created.
- **Role names are not enumerated here.** `membershipSchema.role` is `z.string().min(1)`; validity of the role name is enforced by a separate test against the roles file, not by this schema.
- **`staffTotpSecret` is a single shared secret.** Every account with `state.authenticator: true` is seeded with this one base32 value, not per-account secrets.
