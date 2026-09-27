---
source: src/modules/account/openapi.yaml
sha256: 8b2b9830081af193f71a171dda38b3be1839e3a96420a780ed2e8124c8211184
generated_at: 2026-09-27T14:28:13.953474+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the account module (v2.0.0). Defines the full surface of user-facing account operations—abilities lookup, profile CRUD, email-change lifecycle, password change/check, and deletion request—and pins the exact request/response shapes clients and the server both rely on.

## Key elements

- **`GET /account/abilities`** — Returns the caller's packed authorization rules (both shop and installation scopes). Works for anonymous callers (guest role). The client copy is render-only; every request is re-evaluated server-side.
- **`GET /account`** — Returns the authenticated user's full profile (`UserEnvelope`).
- **`PUT /account`** — Full-replace of writable profile fields (RFC 9110 §9.3.4 semantics; omitted optional fields are cleared, except `analyticsConsent`). Supports JSON and multipart bodies.
- **`PATCH /account`** — Partial merge (RFC 7396 semantics; `null` clears an optional field). Same email-change lifecycle as PUT.
- **`DELETE /account`** — Initiates the two-step account-deletion flow (sends a confirmation token to the user's email).
- **`DELETE /account/pending-email`** — Cancels a pending email change; idempotent no-op if nothing is pending.
- **`POST /account/password`** — Changes the password (proves current password, not mailbox). Revokes all other sessions; returns a fresh access token. A wrong current password yields **422**, not 401, to avoid triggering client logout interceptors.
- **`POST /account/password/check`** — Advisory breached-password lookup for a candidate password; unauthenticated so signup can use it.
- **Local schemas** — `ReplaceAccountRequest`, `UpdateAccountRequest`, `ChangePasswordRequest`, `ChangePasswordResponseEnvelope`, and their multipart variants are declared in this file's `components/schemas`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Primary source for shared schemas (`AbilitiesEnvelope`, `UserEnvelope`) and standard response objects (`Unauthorized`, `Conflict`, `ValidationError`, `TooManyRequests`, `InternalError`, `Success`). This file references them via `$ref` rather than redefining them.
- **`src/modules/account/module.ts`** — The runtime module that mounts and implements every path declared here. The OpenAPI file is its authoritative contract.
- **`src/modules/access/module.ts`** — Owns the authorization rules that `GET /account/abilities` exposes to the client.
- **`src/infrastructure/security/breached-passwords/list.txt`** — The data set behind `POST /account/password/check`; the endpoint reports whether a candidate password appears in this list.

## Notes

- **Abilities path naming**: The plan calls it `/me/abilities`, but it lives under `/account` because a module mounts at a single `basePath`; a second mount point would split the account module into two.
- **Email-change is always two-step**: `PUT`/`PATCH` only records `pendingEmail`; it takes effect only after `POST /account/email-change-confirm`. Sending the current address is a no-op (neither starts nor cancels). A notice goes to the *old* address immediately.
- **`PUT` vs `PATCH` semantics are different**: PUT follows RFC 9110 §9.3.4 (omitted optionals cleared); PATCH follows RFC 7396 (`null` clears, omission leaves unchanged). The `analyticsConsent` field is exempt from clearing in both cases.
- **429 responses** on profile and password routes come from `uploadLimiter` / `credentialLimiters` middleware (see `routes.ts`), not from the OpenAPI layer.
- **`ChangePasswordResponseEnvelope`** can have an absent `data` field on a rare degraded-success path (token re-mint fails after the password write commits) — clients must handle `data === undefined`.
