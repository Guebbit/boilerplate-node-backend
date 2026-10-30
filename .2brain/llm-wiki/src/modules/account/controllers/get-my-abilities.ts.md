---
source: src/modules/account/controllers/get-my-abilities.ts
sha256: 684bd9e4ff9eb92da1aab5fce9c2d05f5cf80efd80e741f9f55f6a3558694e62
generated_at: 2026-10-29T02:26:53.625595+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-my-abilities.ts

## Purpose

Handler for `GET /account/abilities`. Publishes the server's CASL permission rules (in wire format) for the authenticated caller across **both** tenant and platform scopes, so clients can render UI affordances (grey-out, hide) from a single authoritative source instead of each inventing its own guess. The endpoint is strictly read-only; every actual authorization decision is still re-evaluated server-side on each request.

## Key elements

- **`getMyAbilities`** (exported) — Express handler. Resolves the caller in tenant and platform scopes, packs each scope's rules, and returns a JSON body containing `tenant` rules, `platform` rules, `grantableRoles`, `secondFactorRequired`, a `version` fingerprint, the `subjects` vocabulary, and an optional `tenantId`.
- **`rulesFor`** (module-local) — Takes a caller argument for `buildAbility`, constructs a CASL `Ability`, and serializes its rules via `packRules` into a compact tuple array.
- **`modelVersion`** (module-local) — A stable fingerprint computed by `permissionModelVersion` over the IDs in `PERMISSION_RULES`. Changes only when the rule set itself changes, not when a role's assignment changes; lets clients invalidate a cached copy of the model.

## Relationships

- **`@kernel/ability`** (`buildAbility`) — Called inside `rulesFor` to materialize a CASL `Ability` for the given caller.
- **`@kernel/permissions`** — Source of `anonymousCaller`, `callerInScope`, `permissionModelVersion`, `staffRoleWithheld`, `PERMISSION_RULES`, and `PERMISSION_SUBJECTS`; the single source of truth for the permission model.
- **`@modules/access`** (index barrel → `services/grants.ts`) — Provides `grantableRoles`, which lists roles the caller may assign in tenant scope.
- **`@infrastructure/http/response`** (`successResponse`) — Uniform success-wrapper used to shape the HTTP reply.
- **`@types`** (`AuthContext`) — Types the `request.authContext` object the middleware attaches.
- **`routes.ts`** (same module) — Mounts this handler at the `GET /account/abilities` path.

## Notes

- The response shape is **identical for every caller type** (authenticated user, API key, anonymous): `platform` is `[]` rather than `null` when there is no platform scope; `tenantId` is **absent** (not `null`) when the caller has no shop; `grantableRoles` is `[]` for anonymous callers.
- `modelVersion` is a *fingerprint of the rule set*, not a per-role version. Renaming or swapping a rule changes it; reordering the same set or editing a role does not. Clients should compare it to detect a genuinely different model.
- `packRules` / `unpackRules` (CASL) is the wire format contract: the frontend must call `unpackRules` to reconstruct an `Ability` identical to the server's.
- The endpoint deliberately answers for anonymous callers (`guest` role) rather than requiring authentication, so a public client still gets a well-formed response.
