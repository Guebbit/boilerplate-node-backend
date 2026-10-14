---
source: src/modules/account/openapi.yaml
sha256: f38fb13cf6d55ee8800625ccd2261730925fbc414a1900806bfc21514b517bfc
generated_at: 2026-10-14T08:45:00.891116+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **account** module. It defines the HTTP surface the module exposes (profile CRUD, email-change lifecycle, account deletion, and the caller's authorization-ability list), the schemas and error codes that surface belongs to, and the module's contribution to the personal-data export bundle. It exists so clients, tests, and the API bundler share a single machine-readable source of truth for what this module promises.

## Key elements

- **`tags`** – `Auth` (sign-up, login, refresh, session teardown, email recovery) and `Account` (profile, credentials, 2FA, export, deletion). Operations self-file under one or the other.
- **`x-error-codes`** – Module-scoped 429 codes (`EMAIL_CHANGE_TOO_SOON`, `EMAIL_VERIFY_RESEND_TOO_SOON`, `TWO_FACTOR_RESEND_TOO_SOON`) that carry `details.retryAfter`.
- **`x-personal-data`** – Declares the `sessions` section the bundler injects into `AccountExportResponse` (`POST /account/export`). Removing the module removes this section automatically.
- **`/account/abilities` (GET)** – `getMyAbilities`. Returns the caller's server-side authorization rules as two separate scope lists (tenant + installation) plus `grantableRoles`. Answered for anonymous callers too. Client-side rendering aid only; no authority.
- **`/account` (GET / PUT / PATCH / DELETE)** – `getAccount`, `replaceAccount`, `updateAccount`, `requestAccountDelete`. Marked `x-versioned` (bundler adds `If-Match`/`ETag`). PUT is RFC 9110 full-replace; PATCH is RFC 7396 merge-patch. Both accept `application/json` and `multipart/form-data`. Email changes go through a pending-confirm-undo flow, not applied immediately.
- **`/account/pending-email` (DELETE)** – `cancelPendingEmailChange`. No-op safe when nothing is pending.
- **Schema refs** – `ReplaceAccountRequest`, `ReplaceAccountRequestMultipart`, `UpdateAccountRequest`, `ExportSession` (all defined in `components/schemas` of this file, below the truncated section).
- **Response refs** – Standard responses (`Unauthorized`, `Conflict`, `ValidationError`, `TooManyRequests`, `InternalError`, `Success`) are `$ref`'d from the shared root contract rather than re-declared.

## Relationships

- **`shared/contracts/openapi.root.yaml`** – Upstream dependency. All shared schemas (`UserEnvelope`) and standard error responses are `$ref`'d from here. This file never redefines them.
- **`src/modules/access/openapi.yaml`** (via `src/modules/access/module.ts`) – The `AbilitiesEnvelope` schema returned by `GET /account/abilities` lives in the access module's spec; this file cross-references it.
- **`src/modules/account/module.ts`** – The runtime module that mounts the routes defined here. The `basePath` convention noted in the abilities comment ("a module mounts at one basePath") is enforced by this module's wiring.
- **`src/infrastructure/security/breached-passwords/list.txt`** – Consumed by the module's password-handling logic; the contract here (`POST /account/password`, referenced in descriptions) enforces that a candidate password must not appear in that list.

## Notes

- **`x-versioned`** is a custom extension consumed by the API bundler, not a standard OpenAPI keyword. It tells the bundler to inject optimistic-concurrency headers on the listed verbs. Do not remove it without updating the bundler config.
- **Email-change flow is multi-step and stateful.** `PUT`/`PATCH` sets `pendingEmail`; the change only commits via `/account/email-change-confirm`. A 7-day undo link is emailed to the *old* address immediately. Sending the current or already-pending address is a deliberate no-op.
- **`grantableRoles` in abilities** is informational only. A role the caller *sees* listed is still subject to a server-side `409` on assignment.
- **Rate-limiting (429)** on `PUT`/`PATCH /account` comes from an external `uploadLimiter` middleware in `routes.ts`, not from any logic in this module's handler.
- **`analyticsConsent`** is required on PUT (no cleared state); on PATCH it is optional. Forgetting to include it on PUT is a `422`.
- The file is truncated in this view; `components/schemas` and `components/responses` sections below the paths are not shown but are referenced by the operations above.
