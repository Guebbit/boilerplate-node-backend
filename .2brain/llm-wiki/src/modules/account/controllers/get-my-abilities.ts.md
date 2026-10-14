---
source: src/modules/account/controllers/get-my-abilities.ts
sha256: 6488ad4618f34aaeeb657f1f4fcccb2fa7ee9269398a166daef2c2c2231157ae
generated_at: 2026-10-14T08:30:54.078873+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-my-abilities.ts

## Purpose

Handler for `GET /account/abilities`. It publishes the server's enforced CASL permission rules for the caller in **both** scopes (tenant and platform) so the client can render UI affordances (enable/disable/grey-out) without maintaining its own copy of policy. It changes no authorization behavior — every request is still re-evaluated server-side.

## Key elements

- **`getMyAbilities(request, response)`** (exported) — Builds the caller's ability in each scope, packs the rules, and returns a single JSON body containing `tenant` rules, `platform` rules, `grantableRoles`, a `version` fingerprint, and `subjects`. Handles the anonymous (no `authContext`) case by substituting `anonymousCaller()` for tenant scope and an empty array for platform.
- **`rulesFor(caller)`** (private) — Wraps `buildAbility(caller)` and runs the result through CASL's `packRules`, producing the compact tuple-per-rule wire format the frontend unpacks with `unpackRules`.
- **`modelVersion`** (module-level const) — Computed once via `permissionModelVersion` over the declared `PERMISSION_KEYS`. Changes only when the key *set* changes (add/remove/rename), not when a role is edited. Serves as the client's cache-invalidation signal.

## Relationships

- **`src/kernel/permissions.ts`** — Source of `anonymousCaller`, `callerInScope`, `permissionModelVersion`, `PERMISSION_KEYS`, and `PERMISSION_SUBJECTS`. This file is a pure consumer of that model; it never mutates it.
- **`src/kernel/ability.ts`** — Provides `buildAbility`, the single function that turns a caller object into a CASL `Ability`. `rulesFor` delegates to it.
- **`src/modules/access/index.ts`** — Re-exports `grantableRoles`, which this handler calls to include the set of roles the caller *could* assign in tenant scope (empty for anonymous).
- **`src/modules/account/routes.ts`** — The route table that maps `GET /account/abilities` to this handler.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the single response helper used here.
- **`src/types/auth-context.ts`** — Defines `AuthContext`, the shape read off `request.authContext` to scope the caller.

## Notes

- **No nulls in the contract.** `tenantId` is omitted entirely (spread pattern) rather than set to `null`; `platform` is `[]` rather than `null` for callers with no shop. The response shape is uniform for every caller.
- **Two scopes, one response.** A request is always evaluated in exactly one scope, but the *client* navigates across both (shop screens read tenant keys, the health dashboard reads `platform.*` keys). Both lists are published so the client never has to guess which key gates a button.
- **`modelVersion` ≠ role version.** Bumping a role's permissions does *not* change `modelVersion`. Only adding, removing, or renaming a key in `PERMISSION_KEYS` does. A client that caches by this value therefore knows when the *shape* of the model changed vs. just who the caller is.
- **`grantableRoles` mirrors the 409 guard.** The same function that produces the `409` on a disallowed grant also populates this field, so the "what can I grant" list and the "what will the server accept" check cannot drift apart.
