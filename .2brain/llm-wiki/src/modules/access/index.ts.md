---
source: src/modules/access/index.ts
sha256: 4ffe81811b68509ab4a7dc05d33ba4d8bfb0f503f4a6d73457cfdac0689e6099
generated_at: 2026-09-23T17:57:02.445326+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/index.ts

## Purpose

Barrel file for the `access` module. It is the **only** import surface that sibling modules (e.g. `account`) are permitted to use, enforcing a single-point-of-entry convention described in `docs/theory/strategic-ddd.md` §5. Internal runtime schemas (`repository.ts`, `model.ts` runtime values) are intentionally kept private.

## Key elements

- **`export * from './service'`** — Re-exports all public values (functions, classes) from `src/modules/access/service.ts`.
- **`export type * from './model'`** — Re-exports `src/modules/access/model.ts` as **type-only** declarations. No runtime code from `model.ts` is reachable through this barrel; `TenantDocument` and `MembershipDocument` are available solely as TypeScript types.

## Relationships

- **Depends on (re-exports):** `src/modules/access/service.ts`, `src/modules/access/model.ts`.
- **Imported by sibling modules:** `src/modules/account/module.ts` and the account controllers/services (`post-login.ts`, `post-signup.ts`, `post-login-2fa.ts`, `get-oauth-callback.ts`, `services/authentication.ts`, `services/oauth.ts`, `services/profile.ts`, `services/verification.ts`) resolve access-module symbols through this file rather than reaching into sub-paths.
- **Referenced by operational tooling:** `scripts/db/access-grant.ts`, `scripts/db/bootstrap-access.ts`, `scenarios/accounts.ts`, `scenarios/users.ts` consume the same public surface.

## Notes

- The deliberate asymmetry — `service` is a value re-export, `model` is a type-only re-export — means importing a _runtime_ symbol from `model.ts` (e.g., a Zod schema) will **not** work through this barrel. Consumers needing runtime schemas must import `model.ts` directly, which the module rule discourages.
- `repository.ts` has **no** export here at all; it is fully internal.
- Design rationale lives in `docs/theory/authorization.md`.
