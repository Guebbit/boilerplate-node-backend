---
source: src/modules/account/openapi.yaml
sha256: 68de299201a90d232cb244acda5209de4ca6bfa66244e602b12c5032a983c66d
generated_at: 2026-10-29T02:37:45.496653+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **account** module. It defines the full API surface for authentication (signup, login, session lifecycle, email verification) and self-service account operations (profile CRUD, email-change flow, two-factor, data export, account deletion with grace period). Serves as the machine-readable specification that `src/modules/account/module.ts` must implement and that clients consume.

## Key elements

- **Tags** — `Auth` (sign up, log in, refresh, end session, email recovery/verification) and `Account` (profile, credentials, 2FA, export, deletion).
- **`x-error-codes`** — Module-specific error identifiers beyond the shared set: `EMAIL_ALREADY_USED` (409), `EMAIL_ALREADY_VERIFIED` (409), `EMAIL_CHANGE_TOO_SOON` (429), `EMAIL_VERIFY_RESEND_TOO_SOON` (429), `SESSION_IDLE` (401, staff/admin only), `TWO_FACTOR_RESEND_TOO_SOON` (429).
- **`x-personal-data.sessions`** — Declares the `sessions` array this module contributes to the `AccountExportResponse` bundler.
- **`GET /account/abilities`** — Returns the caller's packed authorization rules in two separate lists (tenant-scope and shop-scope). Client-side only for rendering; every request is still re-evaluated server-side. References the `Abilities` schema from the access module.
- **`GET /account`** — Full profile of the authenticated user.
- **`PUT /account`** — Full replace (RFC 9110 §9.3.4): omitted optional fields are cleared. `analyticsConsent` is required (no cleared state). Email change is async via `pendingEmail`.
- **`PATCH /account`** — Merge-patch (RFC 7396): omitted fields unchanged, `null` clears an optional one.
- **`DELETE /account`** — Locks the account immediately, schedules erasure after `NODE_ACCOUNT_DELETION_GRACE_DAYS` (default 30, capped at one calendar month per GDPR Art. 12(3)). Returns 202.
- **`x-versioned: [get, put, patch]`** on `/account` — Bundler annotation that adds `If-Match` / `ETag` / 412 handling to the listed methods.
- **Request bodies** — PUT and PATCH accept `application/json` and `multipart/form-data`; PATCH also accepts `application/merge-patch+json`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Consumes shared schemas (`Account`) and standard error responses (`Unauthorized`, `Conflict`, `ValidationError`, `TooManyRequests`) via `$ref`.
- **`src/modules/access/`** (sibling module) — `GET /account/abilities` returns the `Abilities` schema defined in the access module's OpenAPI spec.
- **`src/modules/account/module.ts`** — The runtime implementation of every path and operation declared here; this file is the contract that module satisfies.

## Notes

- PUT and PATCH are deliberately different: PUT follows RFC 9110 (silence = clear), PATCH follows RFC 7396 (silence = keep, explicit `null` = clear).
- Email change on PUT/PATCH does **not** mutate the address; it sets `pendingEmail`. Finalisation, cancellation, and undo are separate endpoints (`/account/email-change/…`).
- `SESSION_IDLE` (401) applies only to staff/admin sessions governed by `NODE_SESSION_IDLE_TIME_STAFF`; shopper sessions never receive it.
- `GET /account/abilities` answers for anonymous callers too: a visitor holds the `guest` role, so the endpoint is not an "authenticated-only" route.
- The spec is truncated in the visible excerpt; the full file contains additional paths (login, signup, 2FA, email-change sub-routes, export, restore) that follow the same conventions.
