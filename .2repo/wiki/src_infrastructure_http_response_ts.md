# src/infrastructure/http/response.ts

## Purpose

Defines the canonical response envelope that every HTTP endpoint in the application must use. By forcing a single discriminated-union shape (`success: true` → `data`, `success: false` → `errors`), clients and the generated orval API client can branch on one field without knowing which route they called. It also centralizes status-to-code/message mapping so no handler can accidentally leak internals or produce inconsistent wording.

## Key elements

- **`ResponseNeutral`** — Shared base: `success` discriminant, `status`, `message`.
- **`ResponseSuccess<T>`** — Extends neutral with `data: T` and `errors: never` (type-level mutual exclusion with reject).
- **`ResponseReject`** — Extends neutral with `data: undefined` (key present for union-safe property access) and `errors: ResponseErrorItem[]`.
- **`ResponseErrorItem`** — One machine-readable failure: `code` (stable, branchable), `message` (human/translated), optional `details`.
- **`generateSuccess<T>(data, status?, message?)`** — Pure factory for the success envelope; no Express `Response` needed (usable in tests, workers).
- **`successResponse(response, data, status?, message?)`** — Sets HTTP status + `Content-Type` via `.json()`, returns typed `Response<ResponseSuccess<T>>` so controllers can `return` it directly.
- **`generateReject(status?, errors?)`** — Pure factory for the reject envelope; normalizes string-or-item errors into `ResponseErrorItem[]`. Defaults to 400.
- **`rejectResponse(response, status?, errors?)`** — Sends the reject envelope. Does **not** throw; the caller must `return` it.
- **`resolveErrorMessage(status)`** — Returns the single canonical reason phrase for a status; callers cannot override it.
- **`validationErrors(error: ZodError)`** — Maps Zod issues to `ResponseErrorItem[]`, attaching `details.field` (dot-joined path) so clients know *which* field failed.
- **`STATUS_ENVELOPE` / `SERVER_FAULT` / `UNMAPPED_REQUEST_FAULT`** (module-private) — Static lookup tables that feed `resolveErrorCode` (also private) and `resolveErrorMessage`.

## Relationships

- **`src/infrastructure/http/request.ts`** — The paired module for the request side of the same envelope contract; together they define the full request/response dialect.
- **`src/infrastructure/http/controller.ts`** — Historically hosted `validationErrors`; now the layer that calls `successResponse` / `rejectResponse` to terminate requests.
- **`src/infrastructure/http/errors.ts`** — Supplies the stable error `code` strings that `ResponseErrorItem` carries; `rejectResponse` is the single exit point those codes flow through.
- **`src/kernel/middlewares/authorizations.ts`** — Produces 401/403 rejections via `rejectResponse` (or `generateReject` in tests).
- **`src/infrastructure/http/middlewares/security.ts`** — 429/403 rejection paths consume the same envelope.
- **`src/modules/account/controllers/*`** (e.g. `delete-account-confirm`, `get-account`, `delete-session`, etc.) — Call `successResponse`, `rejectResponse`, and `validationErrors` at every endpoint boundary.
- **`src/app/error-handling.ts`** — Global Express error handler that funnels uncaught throws into the reject envelope so no raw stack trace reaches the client.
- **`src/app/routes.ts` / `src/app/system-routes.ts`** — The routers whose handlers all terminate with the functions exported here.

## Notes

- **`errors: never` on success is not a bug.** No runtime value satisfies `never`; the cast in `generateSuccess` is intentional. Its sole purpose is to make TypeScript narrow `ResponseSuccess | ResponseReject` from a single `success` check and to forbid constructing a success object that also carries errors.
- **`data: undefined` on reject is also deliberate.** The key is present at runtime, so `result.data` type-checks on both union branches without a `in` guard.
- **`rejectResponse` does not throw.** Forgetting to `return` it lets execution continue past the handler and triggers Express' "headers already sent" error.
- **`message` on the envelope is developer-facing only.** The user-visible, translatable text lives in `errors[].message`. The top-level `message` is derived exclusively from the status code via `resolveErrorMessage`—callers cannot supply their own, preventing handler names from leaking into 404s.
- **`validationErrors` was moved out of `controller.ts`** because four services import it for pre-response validation; keeping it beside `ResponseErrorItem` avoids a layering violation.
- **`details` is conditionally spread** in both `normalizeErrors` and `validationErrors` so the JSON never contains `"details": undefined`.
- **422 and 429 intentionally have no `code` of their own** in `STATUS_ENVELOPE`; they fall back to `REQUEST_ERROR`. The design treats them as "the request was wrong" rather than distinct machine branches.
- **`generateSuccess` / `generateReject` are split from their send counterparts** (`successResponse` / `rejectResponse`) so the envelope shape can be asserted in unit tests and produced in non-HTTP workers without an Express `Response` object.
