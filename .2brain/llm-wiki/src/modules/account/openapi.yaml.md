---
source: src/modules/account/openapi.yaml
generated_at: 2026-11-22T03:33:29.533488+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/openapi.yaml

## Purpose
OpenAPI 3.1 contract fragment for the `account` module. It declares the module's tags, error codes, personal-data export section and the `/account` endpoints (profile read/replace/update/delete, email change, and others past the visible portion). A bundler merges it with the shared root contract and other modules' fragments.

## Key elements
- **`tags`**: `Auth` (sign up, log in, refresh, end session, email recovery/verification) and `Account` (the signed-in user's profile, credentials, two-factor, data export and deletion). Both are in `x-family: Core`.
- **`x-error-codes`** (top level): module-specific codes with HTTP status and description. These are `EMAIL_ALREADY_CURRENT`, `EMAIL_ALREADY_USED`, `EMAIL_ALREADY_VERIFIED`, `EMAIL_CHANGE_ALREADY_PENDING`, `EMAIL_CHANGE_TOO_SOON`, `EMAIL_VERIFY_RESEND_TOO_SOON`, `SESSION_IDLE` and `TWO_FACTOR_RESEND_TOO_SOON`. The 429 codes carry `details.retryAfter`.
- **`x-personal-data.sessions`**: this module's section of the `POST /account/export` response. The bundler adds it to `AccountExportResponse`, with items of type `ExportSession`.
- **`/account`**:
  - `GET getAccount` returns `AccountView`, which includes `abilities` and `activity`.
  - `PUT replaceAccount` replaces the whole profile; `analyticsConsent` is required.
  - `PATCH updateAccount` merges fields (RFC 7396) and accepts `application/merge-patch+json`.
  - `DELETE requestAccountDelete` returns 202 `AccountDeletion`.
- **`/account/email-change`**: `POST requestEmailChange` sets `pendingEmail`. It returns the `AccountView` body and documents the 401, 409 and 429 error codes.
- **Per-operation `x-error-codes`**: maps a status to the codes it can return, for example `'409': [EMAIL_ALREADY_CURRENT, ...]`.
- **Local schemas** (under `#/components/schemas`): `ReplaceAccountRequest`, `UpdateAccountRequest`, `RequestEmailChangeRequest`, `AccountDeletion`, `ExportSession` and the multipart variants of the profile requests.

## Relationships
- **`src/modules/access/openapi.yaml`** and **`src/modules/addresses/openapi.yaml`**: sibling module contracts that follow the same fragment pattern. The visible portion shows no direct references to them.
- **`src/modules/account/asyncapi.internal.yaml`**: the module's internal async contract. The visible portion does not reference it.

## Notes
- **Bundler-driven extensions**:
  - `x-versioned: [...]` on a path asks the bundler to add `If-Match` and 412 to the listed writes, and `ETag` to the 200s.
  - On `/account/email-change`, the bundler also adds `Content-Location`.
  - `x-personal-data` is merged into the export response.
- **Shared root contract**: the file `$ref`s a shared root contract (`../../../shared/contracts/openapi.root.yaml`) for `AccountView`, `Account` and the `Unauthorized`, `ValidationError`, `TooManyRequests` and `Conflict` responses.
- **ETag semantics**: the edit part of the `/account` ETag is the stored account's revision, which a role change moves. An older `If-Match` then gets 412. The body part changes on every read because of `lastActiveAt`.
- **Client-side abilities**: `abilities` in `AccountView` has no authority. The server re-checks every request.
- **Out-of-scope fields**: role, account state, email and password cannot be changed through PUT or PATCH. An `email` in the body gets 422, and the email goes through `/account/email-change`.
- **Account deletion**: the account is locked at once and erased after `NODE_ACCOUNT_DELETION_GRACE_DAYS` (30 by default, at most one calendar month). It can be restored until then. The call needs a critically fresh session, and an armed second factor needs an `otp` proof, otherwise `401 REAUTH_REQUIRED`.
- **Email change**: it needs a fresh session. The old address gets a 7-day undo link.
