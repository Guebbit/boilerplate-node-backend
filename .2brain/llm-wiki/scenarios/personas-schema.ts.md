---
source: scenarios/personas-schema.ts
sha256: 4bb1dd63ac5ef807448234e44b54cedd2af957f5d9693ffe4ad6082f7c9b9ae8
generated_at: 2026-11-08T02:30:30.457880+00:00
model: ollama:qwen3.8:27b
---

# scenarios/personas-schema.ts

## Purpose

Defines the Zod schema for `shared/scenarios/personas.yaml` and is the single place that loads it. The YAML holds 13 fixed demo login accounts (by the names the paired frontend's journeys expect). The file lives under `scenarios/` rather than `src/infrastructure/` because the infrastructure layer must not import from `scenarios/`.

## Key elements

- **`PERSONA_NAMES`** — Ordered tuple of the 13 account names (`admin`, `user`, `editor`, `moderator`, `unverified`, `twoFactor`, `pendingEmail`, `banned`, `secondShopper`, `manager`, `warehouse`, `support`, `operator`). Order defines seeding order.
- **`PersonaName`** — Union type of the 13 literal names.
- **`personasSchema`** — The top-level `z.strictObject` describing the YAML shape: a `staffTotpSecret` (shared base32 TOTP secret) plus an `accounts` object keyed by every `PersonaName`. Each account is a strict object with `email`, `username`, `defaultPassword`, `memberships` (scope/role pairs), and `state` (flags like `verified`, `active`, `twoFactor`, `authenticator`, `pendingEmail`, `analyticsConsent`).
- **`Persona`** — Inferred TypeScript type for a single parsed account.
- **`personas`** — Eagerly-loaded, validated result of `loadSharedRules('personas', personasSchema, 'scenarios')`. This is the value other modules import.

## Relationships

- **`src/infrastructure/config/shared-rules/load.ts`** — Provides `loadSharedRules`, the function this file calls to read and validate the YAML. This is the only import from `src/` in this file.
- **`scripts/contracts/generate-shared-rule-schemas.ts`** — Imports `personasSchema` (and likely `PERSONA_NAMES`) to emit a JSON Schema document for the personas file.
- **`scripts/docs/generate-persona-tables.ts`** — Consumes `personas` (the parsed data) to render documentation tables of the 13 accounts.
- **`scenarios/accounts.ts` / `scenarios/users.ts` / `scenarios/config.ts`** — Peer modules under `scenarios/` that import `personas` (or `PersonaName`) to seed actual account/user objects and reference persona names in scenario configuration.
- **`tests/unit/scenarios/personas.test.ts`** — Unit-tests that the YAML file conforms to `personasSchema` and that role names in memberships exist in the roles file.

## Notes

- All Zod objects use `z.strictObject`, so any unexpected key in the YAML causes a validation error.
- `staffTotpSecret` is **one shared secret** for every account that has `authenticator: true`; it is not per-account.
- The `role` field in `membershipSchema` is only a non-empty string check here; the actual validity of the role name is enforced by the personas unit test against the roles file.
- `personas` is evaluated at module-load time (top-level call). There is no lazy loader; importing this module will trigger the YAML read.
