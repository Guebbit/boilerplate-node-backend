---
source: src/infrastructure/http/response.ts
sha256: 735ad342b9e7b8521c39de30ea07b3979f98b6360f8164da18e7fc1a52ad6bf7
generated_at: 2026-10-14T08:00:47.733090+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/response.ts

## Purpose

Defines the single canonical response envelope (the `success`/`data`/`errors` discriminated union) that every HTTP endpoint returns, and provides the helpers to build and send both success and failure responses. It exists so clients can branch on `success` without knowing the route, and so the generated API client (orval) has one discriminated union to model.

## Key elements

- **`ResponseNeutral`** — Base interface: `success` (discriminant), `status` (mirrors HTTP status in body), `message` (human-readable summary).
- **`ResponseSuccess<T>`** — `success: true`, `data: T`, `errors: never`. The literal `true` drives TypeScript narrowing.
- **`ResponseErrorItem`** — One structured failure: `code` (from the generated `ErrorCode` union), `message`, optional `details`.
- **`ResponseReject`** — `success: false`, `data: undefined` (explicitly present for union-safety), `errors: ResponseErrorItem[]`.
- **`generateSuccess<T>(data, status?, message?)`** — Pure builder for the success envelope (no Express dependency; usable in tests/workers).
- **`successResponse<T>(response, data, status?, message?)`** — Sends the success envelope via Express; applies status to both the HTTP header and the body.
- **`createdResponse<T>(response, data, location, message?)`** — 201 + `Location` header + success envelope.
- **`createdOrOk<T>(response, data, status?, location, message?)`** — Delegates to `createdResponse` on 201, `successResponse` otherwise.
- **`generateReject(status?, errors?)`** — Pure builder for the failure envelope; defaults to 400.
- **`rejectResponse(response, status?, errors?)`** — Sends the failure envelope; does **not** throw (controllers must `return` it).
- **`resolveErrorMessage(status)`** — Returns the canonical reason phrase for a status; the only source of the envelope-level `message`.
- **`STATUS_ENVELOPE` / `SERVER_FAULT` / `UNMAPPED_REQUEST_FAULT`** — Central map of status → `{ code, message }`. Adding a status here is the single place to keep code and wording in sync.
- **`normalizeErrors(status, errors)`** — Accepts strings or `ResponseErrorItem[]`; guarantees a non-empty array of structured items with a derived `code` and `message`.
- **`resolveErrorCode(status)`** — Maps a status to an `ErrorCode` from the generated catalogue.

## Relationships

- **`src/infrastructure/http/controller.ts`** — The primary consumer; controllers call `successResponse`, `rejectResponse`, `createdResponse`, and `createdOrOk` as their return values.
- **`src/infrastructure/http/errors.ts`** — Defines the `ErrorCode` union and `ResponseErrorItem` contract that this file types against (imported type-only).
- **`src/app/error-handling.ts`** — Global error handler that funnels uncaught exceptions through `rejectResponse`.
- **`src/app/routes.ts` / `src/app/system-routes.ts`** — Route definitions whose handlers return the envelopes produced here.
- **`src/infrastructure/surfaces/create-delete-controller.ts`** — Uses `createdResponse` / `createdOrOk` for resource creation flows.
- **`src/infrastructure/http/ids.ts`** — Uses the success envelope helpers for ID-generation endpoints.
- **`src/infrastructure/http/middlewares/*`** (antibot-log, content-type, idempotency, json-depth, origin, upload) — Middleware that short-circuits with `rejectResponse` (e.g. 413, 415, 429).
- **`src/infrastructure/adapters/logger.ts`** — Logs the envelope shape (status, code) when a response is sent.
- **`src/infrastructure/security/breached-passwords/index.ts`** — Calls `rejectResponse` with structured `ResponseErrorItem` entries for breached-password hits.

## Notes

- **Type-only import of `ErrorCode`:** The file uses `import type { ErrorCode } from '@api/error-codes'` deliberately. A value import would break the `regenerate` script (it loads a scenario → `access` → this file → the not-yet-generated `@api/error-codes`). The `satisfies ErrorCode` check still catches typos at `ts-check` time.
- **`errors: never` on success / `data: undefined` on reject:** These are type-level guards only — neither field appears in the JSON payload. The `as` casts in `generateSuccess`/`generateReject` exist because no runtime literal can satisfy `never`.
- **`rejectResponse` does not throw:** Forgetting to `return rejectResponse(...)` in a controller lets execution fall through and triggers Express' "headers already sent" error.
- **`message` vs `errors[].message`:** The top-level `message` is a fixed, developer-facing reason phrase derived solely from the status code. The user-facing, translatable text lives in `errors[].message`. Callers cannot override the top-level `message`.
- **422 / 429 have no dedicated `ErrorCode`:** They fall through to `REQUEST_ERROR` / `BAD_REQUEST`-level codes intentionally — a client branches on "the request was wrong," not on which flavour.
- **`normalizeErrors` guarantees non-empty `errors`:** A failure response never ships with `errors: []`; the fallback is the status's reason phrase.
