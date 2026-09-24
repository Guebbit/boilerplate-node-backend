---
source: src/infrastructure/http/response.ts
sha256: 8dd8dd36d812f95f50e3a2cc13228180cc2a1b96555c7930cf5fd4f906a4ef66
generated_at: 2026-09-23T17:45:53.720558+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/response.ts

## Purpose

Defines the uniform response envelope for every API endpoint. All responses share a single discriminated-union shape (branch on `success`) so clients can handle any route identically and the generated API client (orval) needs only one type. The file also centralizes status-code-to-error-code/message mapping and Zod validation error serialization, giving the whole HTTP layer one canonical "response dialect."

## Key elements

- **`ResponseNeutral`** — Shared fields: `success` (discriminant), `status` (mirrors HTTP status in-body), `message` (human summary).
- **`ResponseSuccess<T>`** — Success branch: `success: true`, `data: T`, `errors: never` (type-level guard; absent at runtime).
- **`ResponseReject`** — Failure branch: `success: false`, `data: undefined` (explicitly present for union-safety), `errors: ResponseErrorItem[]`.
- **`ResponseErrorItem`** — One structured error: `code` (stable, machine-branchable), `message` (human-readable), optional `details`.
- **`generateSuccess<T>(data, status?, message?)`** — Builds a success envelope without an Express `Response`; usable in tests and non-HTTP workers.
- **`successResponse(response, data, status?, message?)`** — Sends the success envelope; applies `status` to both the HTTP header and the body.
- **`generateReject(status?, errors?)`** — Builds a reject envelope (defaults to 400); normalizes errors internally.
- **`rejectResponse(response, status?, errors?)`** — Sends the reject envelope. Does **not** throw — caller must `return` it.
- **`resolveErrorMessage(status)`** — Returns the single canonical reason phrase for a status code; callers cannot override it.
- **`resolveErrorCode(status)`** — Maps a status to a stable uppercase code string (e.g. `BAD_REQUEST`, `INTERNAL_ERROR`).
- **`normalizeErrors(status, errors)`** — Accepts strings or `ResponseErrorItem` objects; guarantees a non-empty array of well-formed items.
- **`validationErrors(error: ZodError)`** — Converts a Zod failure into `ResponseErrorItem[]`, joining `issue.path` with dots for field identification.

## Relationships

- **`src/infrastructure/surfaces/create-*-controller.ts`** (item, list, search, delete) — Call `successResponse` / `rejectResponse` to send results or failures from their handlers.
- **`src/infrastructure/http/controller.ts`** — Sibling in the HTTP layer; `validationErrors` was deliberately placed here (not in controller) because multiple services import it and it has no Express dependency.
- **`src/infrastructure/http/request.ts`** — Companion file defining the request side of the same endpoint contract.
- **`src/infrastructure/http/errors.ts`** — Provides structured error definitions that flow into `normalizeErrors` / `ResponseErrorItem`.
- **`src/app/error-handling.ts`** — Global error handler that converts uncaught exceptions into `generateReject` / `rejectResponse` output.
- **`src/infrastructure/http/middlewares/idempotency.ts`**, **`antibot-log.ts`**, **`upload.ts`** — Middleware that short-circuits requests via `rejectResponse` (e.g. 429, 413, 403).
- **`src/kernel/middlewares/authorizations.ts`** — Emits 401/403 rejections through `rejectResponse`.
- **`src/app/routes.ts`**, **`system-routes.ts`** — Wire up endpoints whose handlers ultimately call the response helpers.

## Notes

- **`rejectResponse` never throws.** Forgetting the `return` keyword lets execution fall through and triggers Express' "headers already sent" error.
- **`message` on reject envelopes is derived from status, not caller-supplied.** The user-facing text lives in `errors[].message`. This prevents handler names or internal context from leaking into the top-level `message`.
- **`errors: never` in `ResponseSuccess`** is a type-level trick only; the key is absent at runtime. The `as ResponseSuccess<T>` cast in `generateSuccess` is required because no literal can satisfy `never`.
- **`data: undefined` in `ResponseReject` is explicitly present** (not omitted) so that `result.data` type-checks on both branches of the union without a `in`-guard.
- **`STATUS_ENVELOPE` deliberately omits `code` for 422 and 429.** Clients branch on the generic `UNPROCESSABLE_ENTITY` / `TOO_MANY_REQUESTS`-level intent, not on a sub-flavour.
- **`normalizeErrors` guarantees a non-empty `errors` array.** A reject with `errors: []` is impossible by construction.
- **`validationErrors` omits `details` entirely** (conditional spread) when `issue.path` is empty, avoiding serialized `undefined` noise.
