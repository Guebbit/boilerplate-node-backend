---
source: src/modules/users/presenter.ts
sha256: 1f262d60ca0c376af48260081e1b78e166ac517e67e8421749a983c072d2219a
generated_at: 2026-10-15T12:09:12.094111+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/presenter.ts

## Purpose

The single mapping point that turns a stored account document (`UserWire` / `UserDocument`) into the public `User` contract: ISO-stringifies date fields, decrypts PII, resolves the caller's permission actions, and wraps the result in `carryVersion`. It enforces the "persistence wall" — controllers reach user data only through `userService.toUser` / `toUserContract`, never `./model` directly.

## Key elements

- **`presentUser(document, role, actions?)`** — Core mapper. Takes a `UserWire` (superset-compatible with a hydrated document or a lean `search()` row), spreads optional fields conditionally, decrypts `phone` via `decryptPii` + `phoneAad`, and returns a `User`.
- **`userActionsFor(ownerId, ownerLevel, caller)`** — Computes the `{ update, ban, delete }` booleans a caller may perform on a target account. Own-account is always "reachable"; others must rank strictly below the caller. Each action also requires the corresponding `users.any.*` key in the caller's held abilities.
- **`presentUserWithCurrentRole(user, caller?)`** — Single-document convenience: fetches the user's current tenant role from the membership store via `rolesOf`, then delegates to `presentUser`. Omits `actions` when `caller` is absent (the `/account` self-read path).
- **`presentUsersWithCurrentRoles(rows, caller?)`** — Batch version for a list page. Issues `rolesOfMany` + `levelsOfMany` in parallel (two round-trips, not N), then maps each row through `presentUser`.

## Relationships

- **`./model`** (`src/modules/users/model.ts`) — Imports `phoneAad`, `UserDocument`, `UserWire`. This file is the *only* consumer of `phoneAad` at runtime.
- **`@infrastructure/persistence/versioning`** — Imports `carryVersion`, which stamps the document's version onto the returned object.
- **`@infrastructure/security/pii-encryption`** — Imports `decryptPii`; the sole call-site in this file for phone decryption.
- **`@kernel/ability`** — Imports `heldKeys` to check which `users.any.*` keys the caller holds.
- **`@kernel/permissions`** — Imports `isBelowLevel` and `levelOfRoles` for the rank-based access rule.
- **`@modules/access`** (`src/modules/access/index.ts`) — Imports `rolesOf`, `rolesOfMany`, `levelsOfMany` to resolve tenant roles and levels from the membership store.
- **`@kernel/access/tenant`** — Imports `DEPLOYMENT_TENANT_ID` as the tenant scoping constant for all role/level lookups.
- **`@types`** (`src/types/index.ts`, `src/types/auth-context.ts`) — Imports the `User`, `UserActions`, `RoleLevel`, `Caller` contract types.
- **`src/modules/users/services/index.ts`** — The service layer that invokes these three exported functions (`toUser`, `toUserContract`, list presentation) from its controller-facing API.
- **`src/modules/users/tests/integration/service.test.ts`** — Exercises the presenter indirectly through the service's public methods.

## Notes

- **`role` is never read from the document.** The doc's own comment stresses this: the role is always supplied by the caller (resolved from the membership store). Passing `null` simply omits the field from the output.
- **`actions` vs. no-caller:** When `caller` is `undefined` (the `/account` self-read), `actions` is absent from the returned `User`. Controllers must not assume the key exists.
- **`UserWire` over `UserDocument`:** Deliberate — lets the same mapper serve both full hydrated documents and the lean rows returned by `search()`, which lack password/token/2FA material.
- **Phone decryption is scoped here:** This is the one place `document.phone` reaches the wire in decrypted form; the AAD binding is `phoneAad(document.id)`.
- **Conditional spread pattern:** Every optional field uses `...(cond ? { key: val } : {})` rather than `Object.assign` or `?`-destructure, so `undefined` keys never appear in the serialized JSON.
