# src/modules/account/openapi.yaml

## Purpose
OpenAPI 3.0.3 specification for the **account** module (v2.0.0). It is the single source of truth for the HTTP contract of everything account-related: profile read/update/delete, password change, session management, and the user's address book. Other tools (code-gen, client SDKs, CI contract tests) consume this file directly.

## Key elements
- **Paths**
  - `GET /account` — current user profile.
  - `PUT /account` — update own profile (email, username, locale, image); email change resets `verified`.
  - `DELETE /account` — initiate account deletion (sends confirmation token).
  - `POST /account/password` — change password (requires current password).
  - `POST /account/logout` — revoke only the current session.
  - `GET /account/sessions` — list active refresh-token sessions.
  - `DELETE /account/sessions/{sessionId}` — revoke a single session.
  - `GET /account/addresses` / `POST /account/addresses` — address-book list and create.
  - `PUT /account/addresses/{addressId}` — update one address entry (default-slot logic).
  - *(file is truncated; additional address and/or auth paths may follow.)*
- **Local schemas** (under `components/schemas`): `UpdateAccountRequest`, `UpdateAccountRequestMultipart`, `ChangePasswordRequest`, `SessionsEnvelope`, `AddressesEnvelope`, `AddressInput`, `UpdateAddressRequest`.
- **Security scheme**: `bearerAuth` (OAuth2/Bearer) used on all mutating and reading endpoints except `POST /account/logout`, which is unauthenticated (operates on the cookie alone).

## Relationships
- **`shared/contracts/openapi.root.yaml`** — The spec `$ref`s shared components from this file for the `UserEnvelope` schema, the `Id` path-parameter schema, and the standard response objects (`Unauthorized`, `Conflict`, `ValidationError`, `InternalError`, `Success`, `NotFound`). Any change to those shared definitions propagates into this contract.
- **`src/modules/cart/openapi.yaml`** — Sibling module spec in the same `src/modules/` tree. The cart spec may reference the address-book endpoints (e.g. for shipping at checkout) but no direct `$ref` between the two YAML files is visible in this file; the coupling is at the API-surface level (a client calls both modules).

## Notes
- **Wrong current password → 422, not 401.** A 401 would be indistinguishable from an expired token to client interceptors and would log the user out. The 422 carries a translated message.
- **`PUT /account` email change** resets `verified` and triggers a new verification email; a 409 is returned if the new address is already taken.
- **Address default-slot invariant**: a non-empty book always has exactly one `default` entry. `default: false` or an absent `default` on update is a no-op for the slot (avoids orphaning the book with no default).
- **`DELETE /account/sessions/{sessionId}`** on the caller's own session is valid and equivalent to `POST /account/logout`, but cannot clear other clients' cookies — their next refresh will simply fail.
- The spec mixes `application/json` and `multipart/form-data` content types on `PUT /account` to support image upload.
- Relative `$ref` paths go three levels up (`../../../shared/contracts/…`); keep this in mind when relocating the file.
