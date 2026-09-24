---
source: src/modules/account/openapi.yaml
sha256: 6f3458894d000ac52ec73f598a7dae2960da1ae5b64714eb94adf221fffe7759
generated_at: 2026-09-23T18:07:24.181678+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract (v2.0.0) for the account module: the single source of truth for the endpoints a client uses to manage its own identity, credentials, and authorization. It exists so that client code, server tests, and docs all agree on shapes and semantics without re-reading the implementation.

## Key elements

- **`/account/abilities` (GET)** — Returns the caller's packed authorization rules in both scopes (shop + installation). Works anonymously (guest role). Client uses it only for UI rendering; the server re-evaluates every request independently.
- **`/account` (GET / PUT / DELETE)** — Profile read, profile update (email change is deferred via `pendingEmail` until confirmed), and deletion request (token sent to email, confirmed at `/account/delete-confirm`).
- **`/account/password` (POST)** — Changes the authenticated user's password. Revokes all other sessions, re-mints the current one. Wrong current password → **422**, not 401.
- **`/account/password/check` (POST)** — Unauthenticated, advisory breach-status lookup for a candidate password. Never blocks; the four password-set paths remain the actual gate.
- **`/account/reauth` (POST)** — Step-up re-authentication (responds to `401 REAUTH_REQUIRED`). Re-mints the session and returns a fresh access token. Wrong password → 422.
- **`/account/2fa` (GET)** — Lists armed and available second-factor methods, distinguishing deployment-level absence from account-level ineligibility.
- **Local schemas** — `UpdateAccountRequest`, `ChangePasswordRequest`, `ChangePasswordResponseEnvelope`, `PasswordCheckRequest`, `PasswordCheckEnvelope`, `ReauthRequest`, `AuthTokensEnvelope`, etc., defined under `#/components/schemas`.
- **Shared references** — All common response objects (`Unauthorized`, `ValidationError`, `Conflict`, `TooManyRequests`, `InternalError`, `Success`) and envelope schemas (`AbilitiesEnvelope`, `UserEnvelope`) are `$ref`'d from `shared/contracts/openapi.root.yaml`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — This spec imports every shared schema and standard error response from that file via relative `$ref` paths. Changes to the root contract ripple into all module specs.
- **`src/modules/account/module.ts`** — The runtime implementation that satisfies the paths declared here. Route definitions, request validation, and response shapes must stay in sync with this document.
- **`src/modules/access/module.ts`** — Owns the authorization rules that `/account/abilities` serializes. The abilities envelope's content is derived from the access module's rule engine, not from the account module itself.
- **`src/infrastructure/security/breached-passwords/list.txt`** — The data source behind `POST /account/password/check`. The endpoint reports whether a candidate appears in that list; the list is refreshed independently of this spec.

## Notes

- **422 vs 401 for wrong password:** Both `changePassword` and `reauth` deliberately return 422 (not 401) when the current/re-auth password is wrong. A 401 would be intercepted by client auth middleware and silently log the user out of a perfectly valid session.
- **`/account/abilities` naming:** The plan originally called this `/me/abilities`. It lives under `/account` because a module mounts at a single `basePath`; a second mount point for one route would split the module's identity.
- **Rate limiters are external:** `uploadLimiter` (on `PUT /account`) and `credentialLimiters` (on password/reauth routes) are configured in `routes.ts`, not expressed in this spec. They surface as 429 responses.
- **`ChangePasswordResponseEnvelope.data` is optional:** On a rare degraded-success path (password write committed, re-mint failed) the token field is absent. Clients must handle its absence.
- **`PUT /account` email semantics:** Setting email to the *current* address cancels any pending change. A 409 is returned if the target address is already held by another account.
