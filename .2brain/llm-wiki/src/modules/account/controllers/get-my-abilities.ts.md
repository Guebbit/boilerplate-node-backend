---
source: src/modules/account/controllers/get-my-abilities.ts
sha256: 9d150754da5c3f5aea44600a56c6d6cb9760b62d1b13887c48a83e4926b5d592
generated_at: 2026-09-23T18:00:04.262363+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-my-abilities.ts

## Purpose

Express handler for `GET /account/abilities`. It serialises the server's CASL ability rules (for both the tenant and platform scopes) and sends them to the client so the UI can decide what to _render_ without maintaining its own copy of the policy. It does not grant or revoke anything server-side; it is a read-only publication of the rules the server already enforces on every request.

## Key elements

- **`getMyAbilities(request, response)`** — the exported handler. Resolves the caller in tenant and platform scopes, packs rules for each, and responds with `{ tenantId?, tenant, platform, version, subjects }`.
- **`rulesFor(caller)`** (module-private) — builds the ability via `buildAbility(caller)` and serialises its rules with CASL's `packRules` (tuple-per-rule, trailing-absent-members dropped).
- **`modelVersion`** (module-level constant) — a fingerprint of `PERMISSION_KEYS`, computed once at import. Changes only when the set of keys is edited (add/remove/rename), not when role assignments change. Serves as the client's cache-invalidation signal.

## Relationships

- **`src/modules/account/routes.ts`** — registers `getMyAbilities` as the handler for the `GET /account/abilities` route.
- **`src/kernel/ability.ts`** — provides `buildAbility`, which turns a caller descriptor into a CASL `Ability` whose `.rules` are then packed.
- **`src/kernel/permissions.ts`** — source of `anonymousCaller`, `callerInScope`, `permissionModelVersion`, `PERMISSION_KEYS`, and `PERMISSION_SUBJECTS`.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the HTTP reply envelope.
- **`src/types/auth-context.ts`** / **`src/types/index.ts`** — supplies the `AuthContext` type read from `request.authContext`.

## Notes

- **Uniform shape for anonymous callers.** A stranger is mapped to the `guest` role in tenant scope (not "no context"), so the response always contains a `tenant` array. The `platform` field is an empty array `[]` (not absent) when the caller has no platform scope.
- **`tenantId` is conditionally omitted**, not set to `null`. The response contract deliberately has no nullable field.
- **Both scopes are always returned** as separate arrays because the client renders a shared navigation that spans tenant screens and platform dashboard screens. The permission model does not allow one scope's keys to satisfy the other.
- **`modelVersion` ≠ role version.** It is a fingerprint of the _key set_; editing a role's assignments never changes it, but renaming or swapping a key does. Clients use it to detect that their cached rules describe a different model.
- The file is a single-responsibility controller: no business logic, no database access. All policy construction is delegated to the kernel.
