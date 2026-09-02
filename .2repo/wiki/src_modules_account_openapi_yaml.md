# src/modules/account/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the **account** module (v2.0.0). It defines the REST surface for user profile management, password changes, step-up re-authentication, TOTP two-factor lifecycle, session introspection, and logout. Serves as the single source of truth for client SDK generation and API documentation for everything under `/account*`.

## Key elements

- **`/account` (GET / PUT / DELETE)** — Read, update (JSON or multipart), and request deletion of the authenticated user's profile. Email changes reset `verified`; role/state/password are deliberately out of scope.
- **`/account/password` (POST)** — Change password with current-password proof. Revokes all *other* sessions; returns a fresh `AuthTokensEnvelope`.
- **`/account/reauth` (POST)** — Step-up re-authentication. Resolves a `401 REAUTH_REQUIRED` challenge without destroying the session; re-mints the token.
- **`/account/2fa/setup` → `/account/2fa/confirm` (POST)** — Two-step TOTP enrollment. Setup returns a one-time plaintext secret + `otpauth://` URI; confirm arms the secret and returns one-time backup codes.
- **`/account/2fa` (DELETE)** — Disable 2FA; requires a valid TOTP or backup code in the body in addition to the fresh-auth requirement.
- **`/account/logout` (POST)** — Revokes the *current* session only (no bearer required). Always returns 200.
- **`/account/sessions` (GET, …)** — List active sessions (issue-agnostic handles, expiry, `current` flag). Truncated in source; likely includes revoke sub-routes.
- **Local component schemas** — `UpdateAccountRequest`, `UpdateAccountRequestMultipart`, `ChangePasswordRequest`, `ReauthRequest`, `AuthTokensEnvelope`, `TwoFactorSetupEnvelope`, `TwoFactorConfirmRequest`, `TwoFactorConfirmEnvelope`, `TwoFactorDisableRequest`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Heavily referenced for shared schemas (`UserEnvelope`) and standard error/success responses (`Unauthorized`, `Conflict`, `ValidationError`, `InternalError`, `Success`). This file never redefines those; all cross-cutting types live in the root.
- **`src/modules/cart/openapi.yaml`** — Sibling module spec in the same project. No direct `$ref` to or from this file is visible in the source; they co-exist as independent module contracts under the shared root.

## Notes

- **Wrong-password responses are `422`, not `401`.** Both `changePassword` and `reauth` carry an explicit comment: a `401` would be indistinguishable from "token expired" to client interceptors and would log the user out of a perfectly valid session. The `422` carries a translated message.
- **Account deletion is two-step:** `DELETE /account` only sends a confirmation token to email; actual deletion requires a follow-up call to `/account/delete-confirm` (not shown in this file's visible portion).
- **2FA setup is idempotent-with-overwrite:** calling `POST /account/2fa/setup` on an account that already has 2FA enabled replaces the pending secret *and clears the confirmed one*. This is the documented "lost my phone, still have my session" recovery path.
- **`PUT /account` accepts both `application/json` and `multipart/form-data`**, enabling profile-image upload in the same request.
- **`POST /account/logout` has `security: []`** — it deliberately omits the bearer requirement so a client can call it even with a stale/absent token; the refresh cookie is the operative credential.
- The file is truncated in the source snapshot; `GET /account/sessions` response schema and any subsequent session-management routes are not fully visible.
