---
source: src/infrastructure/http/response.ts
sha256: 1191f422a75c6e0acfa205cdae2fce978d241208072396791c46c149dee45b29
generated_at: 2026-10-29T02:05:27.893599+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/response.ts

## Purpose

Provides the response serialiser layer: the internal `ServiceResult` union types (`ResponseSuccess<T>` / `ResponseReject`) that services produce, and the Express-bound functions (`successResponse`, `createdResponse`, `noContentResponse`, `generateReject`, etc.) that put a payload or RFC 9457 problem document on the wire. Separating the "build the result" step from the "send it" step lets unit tests and non-HTTP workers assert on the same shapes without an Express `Response`.

## Key elements

- **`ResponseSuccess<T>` / `ResponseReject`** – Discriminated union (`success: true | false`) for the internal result. `ResponseSuccess` carries `data: T`; `ResponseReject` carries `data: undefined` (explicitly present for union safety) and a non-empty `errors: ResponseErrorItem[]`.
- **`ResponseErrorItem`** – One machine-readable failure: `code: ErrorCode`, `message: string`, optional `details`.
- **`generateSuccess<T>(data, status?)`** – Returns a `ResponseSuccess<T>` without touching Express. Used in tests and non-HTTP contexts.
- **`successResponse<T>(response, data, status?)`** – Sends `response.status(status).json(data)`.
- **`createdResponse<T>(response, data, location)`** – Sets the `Location` header, then delegates to `successResponse` with 201.
- **`createdOrOk<T>(response, data, status, location)`** – Dispatches to `createdResponse` when `status === 201`, otherwise `successResponse`.
- **`noContentResponse(response)`** – Sends `204` via `.end()` (no body, no `Content-Type`).
- **`generateReject(status?, errors?)`** – Builds a `ResponseReject` envelope. Defaults to 400. Accepts plain strings or pre-formed `ResponseErrorItem[]`.
- **`resolveErrorTitle(status)`** – Returns the RFC 9110 English status phrase (patches 413/422 names newer than Node's `STATUS_CODES`).
- **`resolveErrorCode(status)`** – Derives a catalogued `ErrorCode` from the status; 5xx (except 503) maps to `INTERNAL_SERVER_ERROR`; unknown codes fall back to `CLIENT_ERROR`.
- **`resolveErrorText(status)`** – Looks up the i18n key `generic.error-<code>` for a translated fallback message.
- **`normalizeErrors(status, errors)`** – Coerces mixed string/item inputs into a non-empty `ResponseErrorItem[]`, filling in `code`/`message` from the status when omitted.
- **`retryAfterOf(rejection)`** – Extracts the first numeric `details.retryAfter` from a rejection's error items.

## Relationships

- **`src/infrastructure/http/controller.ts`** – Consumers call `successResponse`, `createdResponse`, `createdOrOk`, and `noContentResponse` to terminate requests after invoking a service.
- **`src/app/error-handling.ts`** – Uses `generateReject` and the `ResponseReject` shape to build global unhandled-error responses.
- **`src/app/routes.ts` / `src/app/system-routes.ts`** – Route handlers return the response helpers or the internal result types defined here.
- **`src/infrastructure/http/middlewares/idempotency.ts`** – Captures responses via `res.json`; a route answered with `noContentResponse` (`.end()`) bypasses that ledger, so such routes must not sit behind an `idempotencyKey`.
- **`src/infrastructure/http/errors.ts`** – Supplies the error definitions that callers pass (as strings or structured items) into `generateReject` / `normalizeErrors`.
- **`@api/error-codes`** (imported) – Provides the `ERROR_CODES` catalogue and the `ErrorCode` union used to type `ResponseErrorItem.code` at compile time.
- **`@infrastructure/i18n`** (imported) – `t()` is called by `resolveErrorText` to fetch the translated fallback message.
- **`scenarios/support/demo.ts` / `scenarios/support/doubles/payments/levers.ts`** – Test-support modules that construct or assert on `ResponseSuccess` / `ResponseReject` shapes via `generateSuccess` / `generateReject`.

## Notes

- `ResponseSuccess.errors` is typed `never` and intentionally absent at runtime; `generateSuccess` uses an `as` cast because no literal satisfies `never`. This is a type-level guard only.
- `ResponseReject.data` is explicitly `undefined` (not omitted) so that accessing `result.data` type-checks on both union members without a prior `success` check.
- `noContentResponse` uses `.end()`, not `.json()`. This means the idempotency middleware (which hooks `res.json`) will not record the response. Do not combine 204 routes with `idempotencyKey`.
- `resolveErrorCode` maps any 5xx (except 503) to `INTERNAL_SERVER_ERROR` to avoid leaking specific server-fault wording to clients.
- The `message` field on `ResponseReject` is the RFC 9110 status phrase in English by design (RFC 9457 §3.1.3); the user-facing translated text lives in `errors[].message`.
- `normalizeErrors` guarantees the returned array is non-empty; a caller passing `[]` gets a single item derived from the status, preventing clients from special-casing an empty `errors` array.
