# src/modules/account/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the account module. It defines every endpoint a user calls to manage their own identity, credentials, sessions, and address book — from profile read/update through two-step deletion, password change, session revocation, and CRUD on saved shipping addresses. Serves as the single source of truth for client codegen and server validation.

## Key elements

- **`GET /account`** (`getAccount`) — Returns the full authenticated user profile (`UserEnvelope`).
- **`PUT /account`** (`updateAccount`) — Updates email, username, locale, image. Accepts both `application/json` and `multipart/form-data` (for image upload). Changing email resets `verified` and triggers a verification email. Role/state/password are explicitly out of scope.
- **`DELETE /account`** (`requestAccountDelete`) — Initiates two-step deletion; sends a confirmation token to the user's email.
- **`POST /account/password`** (`changePassword`) — Changes password by proving the current one (no email round-trip). Other sessions remain live.
- **`POST /account/logout`** (`logout`) — Revokes the current session's refresh token. Always returns 200 (idempotent by design).
- **`GET /account/sessions`** (`getSessions`) — Lists live refresh tokens as opaque session handles with expiry and a `current` flag.
- **`DELETE /account/sessions/{sessionId}`** (`revokeSession`) — Revokes a single session; 404 for unknown id.
- **`GET /account/addresses`** / **`POST /account/addresses`** / **`PUT /account/addresses/{addressId}`** (`getAddresses`, `addAddress`, `updateAddress`) — CRUD on the user's address book. Exactly one entry is `default` when the book is non-empty; claiming the slot demotes the previous holder.
- **Local component schemas** — `UpdateAccountRequest`, `UpdateAccountRequestMultipart`, `ChangePasswordRequest`, `SessionsEnvelope`, `AddressesEnvelope`, `AddressInput`, `UpdateAddressRequest`.
- **Tags** — `Account` (profile, sessions, addresses) and `Auth` (password, logout).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Every non-local schema and standard response (`UserEnvelope`, `Id`, `Unauthorized`, `Conflict`, `ValidationError`, `InternalError`, `Success`, `NotFound`) is `$ref`-ed from this file. Changes there propagate directly into this contract's request/response types.
- **`src/modules/cart/openapi.yaml`** — The cart/checkout module consumes the address book defined here: checkout ships to the `default` address unless a specific `addressId` is supplied. Schema or invariant changes to `AddressesEnvelope` / address fields affect cart's integration.

## Notes

- **422, not 401, for wrong current password.** A 401 would be indistinguishable from an expired token to every client interceptor and would log the user out of a valid session. This is a deliberate, documented choice.
- **`POST /account/logout` is always 200.** The caller's goal ("I am no longer logged in here") is met regardless of whether a live session existed; returning an error would add client-side branching for no benefit.
- **Two-step deletion.** `DELETE /account` only *requests*; the actual deletion requires a token submitted to `/account/delete-confirm` (defined later in the file). A stray `DELETE` does not destroy the account.
- **Default-address invariant.** The contract guarantees exactly one `default` when the book is non-empty. `default: false` and an absent `default` field both leave the assignment untouched — you cannot demote without naming a successor.
- **`PUT /account` dual content-type.** Accepts both JSON and `multipart/form-data` so the image field can be uploaded without a separate endpoint; the multipart schema is a distinct local component.
- **404 on someone else's resource.** `PUT/DELETE /account/addresses/{addressId}` returns the same 404 for a valid id belonging to another user as for a fabricated id — no existence leak.
