---
source: src/infrastructure/http/response.ts
sha256: 8d76f3715ed0bc2b47cb5d31ec6aad8f05d9a54f7ded80af667886e9dc0d6b5d
generated_at: 2026-11-14T18:06:29.543301+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/response.ts

## Purpose

Serialises the two outcome shapes of the API — success and failure — into their wire formats. Success sends the resource payload (or 202/204 with no body); failure emits an RFC 9457 `application/problem+json` document whose `errors` extension carries machine-readable codes. Internally both are a single `ServiceResult` union discriminated on `success`; this module is the only layer that touches the Express `Response` object.

## Key elements

- **`ResponseNeutral` / `ResponseSuccess<T>` / `ResponseReject`** – The internal result interfaces. `ResponseSuccess` narrows on `success: true` + `data: T`; `ResponseReject` narrows on `success: false` + `errors: ResponseErrorItem[]`. Both carry a `status` number that mirrors the HTTP status in the body (survives proxy rewrites).
- **`ResponseErrorItem`** – One structured failure: `code` (typed `ErrorCode`), `message` (translated, user-safe), optional `details`.
- **`generateSuccess<T>(data, status?)`** – Builds a `ResponseSuccess` without an Express `Response`; usable in tests and non-HTTP workers.
- **`successResponse<T>(res, data, status?)`** – Sends `data` as the JSON body with the given status (default 200).
- **`createdResponse<T>(res, data, location)`** – 201 + `Location` header (RFC 9110 §9.3.3).
- **`createdOrOk<T>(res, data, status?, location)`** – Delegates to `createdResponse` when status is 201, otherwise `successResponse`.
- **`acceptedResponse(res)`** – 202, no body, via `.end()`.
- **`noContentResponse(res)`** – 204, no body, via `.end()`.
- **`resolveErrorTitle(status)`** – Returns the English RFC 9110 status phrase (e.g. "Unprocessable Content"); falls back to "Server Error"/"Client Error" for unlisted codes.
- **`generateReject(status?, errors?)`** – Builds a `ResponseReject` envelope. Defaults to 400. Accepts plain strings or structured `ResponseErrorItem`s; guarantees a non-empty `errors` array.
- **`rejectResponse`** *(truncated in source)* – Sends the reject envelope; the sole path for 429, translating `details.retryAfter` into the `Retry-After` header and `details.policy` into `RateLimit` headers.
- **`normalizeErrors`** (internal) – Coerces mixed string/item inputs into `ResponseErrorItem[]`, deriving `code` from status when the caller omits it.
- **`CURRENT_STATUS_TITLES`** – Overrides Node's stale RFC 7231 names for 413 and 422.

## Relationships

- **`src/infrastructure/http/controller.ts`** – The controller layer calls `successResponse`, `createdResponse`, `createdOrOk`, `acceptedResponse`, `noContentResponse`, and `rejectResponse` to emit HTTP answers; this file is the leaf it depends on for all wire output.
- **`src/infrastructure/http/errors.ts`** – Provides the `ErrorCode` catalogue and `ERROR_CODES` object that `resolveErrorCode` and `normalizeErrors` validate against when deriving a machine code from a status.
- **`src/app/error-handling.ts`** – Global Express error middleware that funnels uncaught errors into `generateReject`/`rejectResponse`.
- **`src/app/routes.ts`, `src/app/config-routes.ts`, `src/app/system-routes.ts`** – Route handlers that return `ServiceResult` values the controllers then serialise through this module.
- **`src/infrastructure/http/middlewares/idempotency.ts`** – Wraps the Express response send methods, so `acceptedResponse` and `noContentResponse` (which bypass `.json()`) are still recorded by the idempotency ledger and replayed bodiless.
- **`src/infrastructure/http/middlewares/antibot-log.ts`** – Likely calls `rejectResponse` for 403/429 antibot rejections.
- **`src/infrastructure/http/middlewares/json-depth.ts`** – Likely calls `rejectResponse` with a 400/413 when a payload exceeds the depth limit.
- **`src/infrastructure/http/middlewares/content-type.ts`** – Likely calls `rejectResponse` with a 415 on a wrong `Content-Type`.
- **`src/infrastructure/http/ids.ts`** – Supplies the resource path strings passed to `createdResponse`'s `location` parameter.
- **`scripts/audit/api-standards.yaml`** – Audits that responses conform to the envelope and problem-details shapes defined here.

## Notes

- `202` and `204` responses use `.end()`, **not** `.json(undefined)`. Express 5 would emit a JSON content-type with zero bytes for `.json(undefined)`, violating RFC 9110.
- `ResponseReject.data` is explicitly `undefined` (key present, value absent) so that TypeScript can access `.data` on both branches of the `ServiceResult` union without a missing-property error.
- `resolveErrorTitle` is intentionally English and status-class-only (e.g. "Not Found") so the `title` never leaks a handler name; the human-readable translation lives in `errors[].message` via i18n.
- `normalizeErrors` guarantees a non-empty `errors` array: a caller passing `[]` gets a single item with the status-derived generic message, preventing clients from special-casing an empty list.
- `generateSuccess` / `generateReject` are split from their `successResponse` / `rejectResponse` send counterparts so the internal shape can be asserted in unit tests without an Express `Response`.
- The `code` field on `ResponseErrorItem` is typed against the generated `ErrorCode` union (compile-time safety), while the wire contract keeps `code: string` open-ended for forward compatibility.
