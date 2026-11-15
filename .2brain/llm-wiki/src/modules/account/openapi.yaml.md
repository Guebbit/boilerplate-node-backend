---
source: src/modules/account/openapi.yaml
sha256: e2e0177075ec00227db501fd8531f734d1b22acfd1b86e8e218c426d47840d01
generated_at: 2026-11-14T18:39:13.898438+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/openapi.yaml

## Purpose

OpenAPI 3.1.0 module contract for the **account** domain. It declares the module's tags, custom error codes, its slice of the personal-data export payload, and the full request/response schemas for authentication and self-service profile endpoints. It exists as the single source of truth for the account API surface so that clients, bundlers, and code generators can consume it without parsing handler code.

## Key elements

- **`tags`** — Declares two operation families (`Auth`, `Account`), both marked `x-family: Core`, used by the bundler to group routes.
- **`x-error-codes`** — Module-local error-code registry (e.g. `EMAIL_ALREADY_CURRENT`, `EMAIL_CHANGE_TOO_SOON`, `SESSION_IDLE`, `TWO_FACTOR_RESEND_TOO_SOON`) with HTTP status and human description. Referenced inline via `x-error-codes` on individual operations.
- **`x-personal-data`** — Declares the `sessions` array (schema `ExportSession`) that the bundler injects into `AccountExportResponse` for `POST /account/export`. Removing this key removes the section from the export.
- **`paths./account`** — `GET` (current profile + `abilities` + `activity`), `PUT` (full replace), `PATCH` (merge-patch), `DELETE` (lock + grace-period erase). Marked `x-versioned: [get, put, patch]` so the bundler adds `If-Match`/`412`/`ETag` handling.
- **`paths./account/email-change`** — `POST` to start a pending email change (requires fresh session, optional `otp`). Marked `x-versioned: [post]`.
- **Schemas referenced locally** — `ReplaceAccountRequest`, `UpdateAccountRequest`, `AccountDeletion`, `ExportSession`, `RequestEmailChangeRequest`, etc., defined in `#/components/schemas` (truncated in the excerpt but implied by the `$ref`s).
- **Shared schema/response refs** — `AccountView`, `Account`, `Unauthorized`, `ValidationError`, `TooManyRequests`, `Conflict` are all `$ref`'d from `shared/contracts/openapi.root.yaml`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — This file `$ref`s shared schemas (`AccountView`, `Account`) and shared responses (`Unauthorized`, `ValidationError`, `TooManyRequests`, `Conflict`) from that root. The account module inherits its base types and standard error envelopes from there.
- **`src/modules/account/rules.yaml`** — The `abilities` object returned by `GET /account` (and carried on sign-in / token refresh) is the server-side rules packed for client evaluation. `rules.yaml` is the source of those rules; this spec documents their shape via the shared `AccountView` schema.
- **`src/modules/api-keys/module.ts`** — Listed as a graph neighbor; no direct `$ref` or textual dependency is visible in the truncated content of this file.

## Notes

- **Bundler directives (`x-versioned`)** — Not standard OpenAPI. The bundler reads these to inject `If-Match`/`ETag`/`412` on the listed verbs and `ETag`+`Content-Location` on POST 2xx. They have no runtime effect outside the bundler.
- **`x-error-codes` on operations** — Extends the module-level list with per-operation codes (e.g. `REAUTH_REQUIRED` on 401 for destructive actions). Handlers must return these exact codes; the spec is the contract.
- **`PUT` vs `PATCH` semantics** — PUT clears optional fields it doesn't mention (RFC 9110 §9.3.4) and *requires* `analyticsConsent`. PATCH follows RFC 7396 merge-patch: omitted fields are unchanged, `null` clears. `email` in either body is rejected 422.
- **`DELETE /account`** — Returns `202`, not `200`. The account is locked immediately and erased after `NODE_ACCOUNT_DELETION_GRACE_DAYS` (capped at one calendar month per GDPR Art. 12(3)). Requires a critically fresh session; 2FA accounts also need an `otp` proof.
- **Rate-limit annotations** — `429` responses carry `details.retryAfter`; `uploadLimiter` sits in front of PUT/PATCH (see `routes.ts`).
