---
source: src/modules/addresses/controllers/put-address-default.ts
sha256: 439a667ee0dd83496b31a3f79996adea65f141ae92f21fa82d4bdf5a9df162bc
generated_at: 2026-10-14T14:51:38.011143+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/put-address-default.ts

## Purpose

Thin HTTP adapter for `PUT /account/addresses/:addressId/default`. It validates the `addressId` path parameter, delegates to the address service's `addressSetDefault`, and maps the result onto an Express response. No request body is expected — the URI alone is the statement (idempotent per RFC 9110 §9.3.4).

## Key elements

- **`putAddressDefault`** (exported function) — Express handler. Reads the authenticated user id from `request.authContext!`, validates `addressId` via `requireId`, calls `addressSetDefault(id, addressId)`, then either returns the demoted/refused result (`refused`) or sends a 200 `successResponse` with the now-default `Address`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `catchAs` (uniform error-to-HTTP mapping in the `.catch` branch) and `refused` (short-circuits with a 409 when the service signals a conflict).
- **`src/infrastructure/http/ids.ts`** — supplies `requireId`, which validates the `addressId` param and emits a 404 with the i18n key `addresses.not-found` on failure.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse`, the helper that serializes the `Address` payload into the JSON body.
- **`src/modules/addresses/service.ts`** — provides `addressSetDefault`, the actual business logic (setting one entry as default, demoting the previous one).
- **`src/modules/addresses/routes.ts`** — registers this controller on the `PUT /account/addresses/:addressId/default` route (and applies the `isAuth` middleware that populates `request.authContext`).
- **`src/types/index.ts`** — defines the `Address` type used in the response generic.

## Notes

- `request.authContext!` uses a non-null assertion; it is safe only because the `isAuth` middleware (applied in `routes.ts`) runs first and sets the field.
- The response body contains only the entry that *became* default. The previously-default entry is a different row; clients needing the full list must issue a separate GET.
- The `name: 'addressId'` option passed to `requireId` is used for the 404 message context, not for routing.
