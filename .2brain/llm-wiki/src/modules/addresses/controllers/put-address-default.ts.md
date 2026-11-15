---
source: src/modules/addresses/controllers/put-address-default.ts
sha256: 1f38a830dc390855c261fa1e577e94885b4e89e7039853e0c17438191ceef5db
generated_at: 2026-11-14T19:18:35.891708+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/controllers/put-address-default.ts

## Purpose

Thin HTTP adapter for `PUT /account/addresses/:addressId/default`. Translates the request (auth context + `addressId` param) into a call on the address service's `setDefault` method, then serializes the result as a `200` JSON response. Exists so the address service stays transport-agnostic.

## Key elements

- **`putAddressDefault(request, response)`** — The sole export. Reads `request.authContext!.id` (set upstream by `isAuth` middleware), validates the `addressId` route param via `requireId`, delegates to `addressService.setDefault`, and responds with the newly-default `Address` object (HTTP 200) or a refusal/error shape.

## Relationships

- **`src/modules/addresses/service.ts`** — Imports `addressService` and calls its `setDefault(userId, addressId)` method; the actual business logic lives in that module.
- **`src/infrastructure/http/ids.ts`** — Uses `requireId` to parse and validate the `addressId` route param, short-circuiting with a 404 on failure.
- **`src/infrastructure/http/response.ts`** — Uses `successResponse` to emit the standard `{ data }` envelope on success.
- **`src/infrastructure/http/controller.ts`** — Uses `refused` (business-level rejections) and `catchAs` (mapping thrown errors to an HTTP error response) as the two non-success paths.
- **`src/types/index.ts`** — Imports the `Address` type to annotate the success response payload.
- **`src/modules/addresses/routes.ts`** — Registers this handler on the `PUT …/default` route (the only caller in the dependency graph).

## Notes

- **Idempotent by design** — PUT with no body; the URI itself is the statement (RFC 9110 §9.3.4). Re-sending is safe.
- **No `If-Match` / ETag** — There is no `GET` on this URL, so no client can hold a concurrency token; optimistic locking is intentionally absent.
- **Response is the promoted entry only** — The demoted (formerly-default) address is a *different* row; clients must refetch the book if they need the new state of the old default.
- **Promise chain, not `async/await`** — The handler uses `.then/.catch` rather than `try/catch`; keep that style if editing.
- **Auth is assumed, not checked** — `request.authContext!` uses a non-null assertion; the `isAuth` middleware is the sole guard. Removing that middleware upstream would produce a runtime crash here, not a `401`.
