---
source: src/modules/account/openapi.yaml
sha256: 691ec169b726a2f0045f11da171b093e8baefbd50be91940f4e092c218ac70b9
generated_at: 2026-11-08T04:13:55.567131+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract for the **account** module. It declares the full API surface for authentication (signup, login, refresh, session teardown, email recovery) and account self-service (profile CRUD, email change, two-factor, data export, deletion). Clients and the server implementation both derive from this file; it is the single source of truth for request/response shapes, error codes, and operational semantics of every `/account/*` endpoint.

## Key elements

- **`tags`** — Two tags (`Auth`, `Account`), both in the `Core` family, used to group operations.
- **`x-error-codes`** (module-level) — Shared error codes across all paths: `EMAIL_ALREADY_USED` (409), `EMAIL_ALREADY_VERIFIED` (409), `EMAIL_CHANGE_TOO_SOON` (429), `EMAIL_VERIFY_RESEND_TOO_SOON` (429), `SESSION_IDLE` (401), `TWO_FACTOR_RESEND_TOO_SOON` (429). The 429s carry `details.retryAfter`.
- **`x-personal-data`** — Declares the `sessions` section contributed to the `POST /account/export` response; the bundler merges it into `AccountExportResponse`.
- **`x-versioned: [get, put, patch]`** on `/account` — A bundler extension that adds `If-Match` request header / `412` response to writes and `ETag` to `200` responses.
- **`paths`** — `/account` (GET, PUT, PATCH, DELETE), `/account/email-change` (DELETE), `/account/email-change/resend` (POST), and further paths (truncated). Each carries an `operationId` and references shared schemas/responses.
- **Operation IDs visible** — `getAccount`, `replaceAccount`, `updateAccount`, `requestAccountDelete`, `cancelPendingEmailChange`, and (truncated) more.
- **PUT vs PATCH semantics** — PUT follows RFC 9110 §9.3.4 (omitted optional field is cleared; `analyticsConsent` is always required); PATCH follows RFC 7396 JSON Merge Patch (omitted field unchanged, `null` clears).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — The primary source of shared schemas and responses. Every path's 200/401/409/422/429 responses and the `AccountView` / `Account` body schemas are `$ref`-imported from this file. This file is a *consumer*; it never redefines those types.
- **`src/modules/account/rules.yaml`** — The `GET /account` response embeds an `abilities` object described as "the rules the SERVER enforces, packed for the client to evaluate." `rules.yaml` is the authoritative source of those rules; this file documents the contract that carries them but does not define them.

## Notes

- **ETag scope** — The `ETag` is computed over the *stored account record*, not over the JSON body returned. A role change will **not** invalidate an `If-Match` taken from an earlier read (no spurious 412).
- **`abilities` is advisory only** — The client copy is for rendering decisions. Every request is re-evaluated server-side; the client value grants no authority.
- **Email change is deferred** — `PUT`/`PATCH` set `pendingEmail`; the change takes effect only after `POST /account/email-change/confirm`. A 7-day one-time undo link is mailed to the *old* address immediately. Re-submitting the current or already-pending address is a no-op.
- **`SESSION_IDLE` (401)** applies only to staff/admin sessions exceeding `NODE_SESSION_IDLE_TIME_STAFF`; shopper sessions never receive it.
- **Account deletion is two-phase** — `DELETE /account` returns `202`, locks immediately, and schedules erasure at `purgeAt` (≤ 30 days, GDPR Art. 12(3)). A restore link is emailed; the account is not yet gone.
- **`uploadLimiter`** sits in front of `PUT`/`PATCH /account` (referenced in 429 comments, defined in `routes.ts`), producing the `TooManyRequests` response.
- **Multipart support** — Both PUT and PATCH accept `multipart/form-data` in addition to JSON, enabling image upload alongside field changes.
