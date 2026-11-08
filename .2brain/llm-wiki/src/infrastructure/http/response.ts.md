---
source: src/infrastructure/http/response.ts
sha256: 098828229c98c5d92f2245a44a546dc23291d7ae3bc374b308337c7fa6105c7f
generated_at: 2026-11-08T03:34:34.438905+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/response.ts

## Purpose

Serialises the two outcomes a service produces (`ResponseSuccess<T>` / `ResponseReject`) into HTTP responses, and provides the pure constructors (`generateSuccess`, `generateReject`) that build those envelopes without touching Express. Success payloads are sent as-is; failures are wrapped in RFC 9457 problem-details with a structured `errors` array carrying typed machine codes.

## Key elements

- **`ResponseNeutral`** — shared discriminant interface: `success: boolean` + `status: number` (mirrored in-body so it survives proxy rewrites).
- **`ResponseSuccess<T>`** — `success: true`, carries `data: T`, `errors: never` (compile-time guard only; absent at runtime).
- **`ResponseReject`** — `success: false`, `data: undefined` (explicitly present for union-safety), `errors: ResponseErrorItem[]`.
- **`ResponseErrorItem`** — one machine-readable failure: `code: ErrorCode` (typed against the generated catalogue), `message: string`, optional `details`.
- **`generateSuccess<T>(data, status?)`** / **`generateReject(status?, errors?)`** — pure constructors (no Express), usable in unit tests and non-HTTP workers.
- **`successResponse`** / **`createdResponse`** / **`createdOrOk`** — Express senders for 200, 201 (+ `Location`), and idempotent-create respectively.
- **`acceptedResponse`** (202) / **`noContentResponse`** (204) — bodiless senders; use `.end()` rather than `.json()` to avoid Express 5 emitting a JSON content-type on empty bodies.
- **`resolveErrorTitle(status)`** — returns the RFC 9110 English status phrase (falls back to "Server Error" / "Client Error").
- **`resolveErrorCode`** (internal) — derives an `ErrorCode` from a status by UPPER_SNAKE-ing the title; 5xx (non-503) → `INTERNAL_SERVER_ERROR`; unknown → `CLIENT_ERROR`.
- **`normalizeErrors`** (internal) — coerces mixed `string | ResponseErrorItem[]` inputs into a non-empty array of full `ResponseErrorItem`s, filling code/message from the status when omitted.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Controllers call the `*Response` helpers (`successResponse`, `createdResponse`, `acceptedResponse`, `noContentResponse`, `createdOrOk`) to terminate a request.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — The idempotency ledger monkey-patches both `res.json` and `res.end`; bodiless responses (202, 204) still get recorded and replayed correctly through this mechanism (called out in the JSDoc of `acceptedResponse` and `noContentResponse`).
- **`src/app/error-handling.ts`** — Consumes `generateReject` / `ResponseReject` to produce the error envelope that reaches the client.
- **`src/infrastructure/http/errors.ts`** — Supplies the `ErrorCode` catalogue and `ERROR_CODES` map that `resolveErrorCode` and `ResponseErrorItem.code` are typed against.

## Notes

- `errors: never` on `ResponseSuccess` is a type-level sentinel only; the property does not exist at runtime. The `as ResponseSuccess<T>` cast in `generateSuccess` exists solely to satisfy this.
- `ResponseReject.data` is explicitly `undefined` (key present) so that `result.data` type-checks on both branches of the `ServiceResult` union without a property-missing error.
- `CURRENT_STATUS_TITLES` overrides Node's stale RFC 7231 names (413, 422) with the current RFC 9110 phrases; any other status falls through to `STATUS_CODES`.
- `normalizeErrors` guarantees a non-empty `errors` array — a reject with `errors: []` is impossible by construction.
- The i18n lookup key for the fallback message is `generic.error-<code>` (kebab-case), coupling the code and its sentence so they cannot be listed apart.
