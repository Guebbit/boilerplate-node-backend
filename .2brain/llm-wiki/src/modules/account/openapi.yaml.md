---
source: src/modules/account/openapi.yaml
sha256: e7c3bb7b3d6f019e4fb6384647a49cc46969b92a7e7ecfb0586e2beed55373f8
generated_at: 2026-10-15T09:58:08.401994+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **account** module. It defines the module's public HTTP surface — authentication (sign-up, login, refresh, email verification, session teardown) and account management (profile CRUD, password, two-factor, data export, deletion) — and is consumed by the spec bundler, which merges it into the root document under the module's `basePath`.

## Key elements

- **`x-error-codes`** — module-specific error codes (`EMAIL_CHANGE_TOO_SOON`, `EMAIL_VERIFY_RESEND_TOO_SOON`, `SESSION_IDLE`, `TWO_FACTOR_RESEND_TOO_SOON`) with their HTTP status and `retryAfter` semantics; the bundler hoists these into the root `x-error-codes`.
- **`x-personal-data`** — declares this module's contribution (`sessions`) to the composite `POST /account/export` response; removing the module removes the section.
- **`tags`** (`Auth`, `Account`) — grouping labels for operations in the module.
- **`/account/abilities` (GET)** — returns the caller's server-enforced authorization rules (tenant-scope and shop-scope lists plus `grantableRoles`) packed for client-side *rendering* only; no authority, answered even for anonymous (`guest`) callers.
- **`/account` (GET / PUT / PATCH / DELETE)** — profile endpoints:
  - **GET** — current user's full profile (`UserEnvelope`).
  - **PUT** — replace all writable fields (RFC 9110 §9.3.4); `analyticsConsent` is mandatory (no cleared state); email change is async (→ `pendingEmail`).
  - **PATCH** — merge-patch writable fields (RFC 7396); omitted fields untouched; same async email-change flow.
  - **DELETE** — initiate the account-deletion flow; sends a one-time confirmation token to the user's email.
- **`/account/pending-email` (DELETE)** — cancel a pending email change without proving it; safe no-op if nothing is pending.
- **`x-versioned`** annotation on `/account` — signals the bundler to attach `ETag` / `If-Match` (and a 412 response) to the listed methods.
- **Schemas** (defined further in the file, truncated here) — `ReplaceAccountRequest`, `UpdateAccountRequest`, `*Multipart` variants, `ExportSession`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — this file `$ref`s shared schemas (`UserEnvelope`) and standard error responses (`Unauthorized`, `Conflict`, `ValidationError`, `TooManyRequests`, `InternalError`, `Success`) from the root spec. The bundler merges this module's document into that root.
- **`src/modules/account/module.ts`** — the runtime module that mounts the routes declared here under its `basePath` and supplies handlers for each `operationId`.
- **`src/modules/access/module.ts`** — the access module whose contract (`../access/openapi.yaml#/components/schemas/AbilitiesEnvelope`) is `$ref`'d by the `/account/abilities` response schema; the two modules share the authorization model.
- **`src/infrastructure/security/breached-passwords/list.txt`** — the breached-password list consulted by this module's authentication operations (sign-up, password change) to reject credentials found in known breaches.

## Notes

- `/account/abilities` is intentionally colocated under `/account` (not `/me/abilities`) because a module mounts at a single `basePath`; a second mount point would make the module "two things."
- The abilities response is **non-authoritative by contract**: it tells a client what to *grey out*, never what to *allow*; every real request is re-evaluated server-side.
- Email change is a **two-step async flow**: `PUT`/`PATCH` sets `pendingEmail` → `POST /account/email-change-confirm` proves the new address → a 7-day one-time undo link is mailed to the *old* address at the moment the change is requested. A no-op send (current or already-pending address) neither starts, restarts, nor cancels anything.
- PUT and PATCH differ in omitted-field semantics (clear vs. leave), but both route email changes through the same `pendingEmail` pipeline.
- `SESSION_IDLE` (401) applies only to staff/admin sessions; shopper sessions never receive it.
- The file is longer than shown here; the truncated portion contains the remaining Auth and Account operations (sign-up, login, refresh, password, 2FA, export, deletion confirmation, etc.) and their schemas.
