---
source: src/infrastructure/http/response.ts
sha256: 97ad9cf2bbfc9be16c6f2aebcebdc5689e9361504540dc5c8333db2b07b4127d
generated_at: 2026-10-15T09:50:46.699236+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/response.ts

## Purpose

Defines the canonical response envelope used by every API endpoint. All routes return the same top-level discriminated-union shape (`ResponseSuccess<T>` | `ResponseReject`) so that clients (including the orval-generated API client) can branch on `success` without route-specific knowledge. The file also provides the Express helpers that serialize and send that envelope.

## Key elements

- **`ResponseNeutral`** — base interface: `success`, `status`, `message`.
- **`ResponseSuccess<T>`** — success branch: `success: true`, `data: T`, `errors: never` (type-level only, absent at runtime).
- **`ResponseReject`** — failure branch: `success: false`, `data: undefined` (explicitly present for union-safety), `errors: ResponseErrorItem[]`.
- **`ResponseErrorItem`** — one structured error: `code: ErrorCode`, `message: string`, optional `details`.
- **`generateSuccess<T>(data, status?, message?)`** — builds a success envelope object without an Express `Response` (usable in tests / workers).
- **`successResponse(response, data, status?, message?)`** — serializes and sends a success envelope via Express.
- **`createdResponse(response, data, location, message?)`** — 201 + `Location` header (RFC 9110 §9.3.3).
- **`createdOrOk(response, data, status?, location, message?)`** — dispatches to `createdResponse` when status is 201, otherwise to `successResponse`.
- **`resolveErrorCode(status)`** / **`resolveErrorMessage(status)`** — map an HTTP status to its stable `ErrorCode` and canonical English reason phrase.
- **`normalizeErrors(status, errors)`** — accepts a mix of plain strings and `ResponseErrorItem`s, guarantees a non-empty array, and fills missing `code`/`message` from the status.
- **`generateReject(status?, errors?)`** — builds a reject envelope (defaults to 400).
- **`rejectResponse(response, status?, errors?)`** — serializes and sends a reject envelope via Express.

## Relationships

- **`src/infrastructure/http/controller.ts`** — controllers call `successResponse`, `createdResponse`, `createdOrOk`, and `rejectResponse` as their terminal return values.
- **`src/app/error-handling.ts`** — the global error handler routes uncaught exceptions through `rejectResponse`.
- **`src/infrastructure/http/errors.ts`** — provides domain-specific error constructors that produce `ResponseErrorItem` objects consumed by `normalizeErrors`.
- **`src/infrastructure/http/ids.ts`** — ID validation failures are surfaced as `ResponseErrorItem` entries within a reject envelope.
- **`src/infrastructure/http/middlewares/*`** (antibot-log, content-type, idempotency, json-depth, origin, upload) — each middleware either calls `rejectResponse` directly or throws an error caught by the error handler, which then uses it.
- **`src/infrastructure/surfaces/create-delete-controller.ts`** — uses `createdResponse` / `createdOrOk` for resource-creation endpoints and `rejectResponse` for failures.
- **`src/app/routes.ts` / `src/app/system-routes.ts`** — route handlers (via their controllers) emit the envelopes defined here.
- **`@api/error-codes`** (generated) — provides the `ErrorCode` union that types `ResponseErrorItem.code`; imported **type-only** to avoid a codegen circularity (see Notes).

## Notes

- **Type-only import of `ErrorCode`.** The value import would create a cycle during `npm run regenerate` (the file sits on the bundle's incidental load path *before* `gen:api` produces the catalogue). `satisfies ErrorCode` at check time still enforces correctness.
- **`errors: never` / `data: undefined` are type-level sentinels.** They exist solely to drive TypeScript narrowing and union-safety; they are absent (or `undefined`) at runtime.
- **`rejectResponse` does not throw.** Controllers must `return rejectResponse(...)`; forgetting `return` lets execution continue and triggers Express' "headers already sent" error.
- **`message` is derived, not caller-supplied.** `resolveErrorMessage` produces exactly one canonical phrase per status, so a handler name never leaks into a 404 body. The user-facing text lives in `errors[].message`.
- **422 and 429 intentionally have no `code`** in `STATUS_ENVELOPE`; they fall through to the generic `REQUEST_ERROR` code. Clients are expected to branch on "the request was wrong," not on which flavour.
- **`normalizeErrors` guarantees `errors.length ≥ 1`.** A reject envelope with an empty array would force every client to special-case it.
