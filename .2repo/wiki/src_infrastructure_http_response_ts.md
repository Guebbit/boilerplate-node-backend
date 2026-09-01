# src/infrastructure/http/response.ts

## Purpose

Defines the canonical response envelope that every HTTP endpoint in the codebase returns, guaranteeing a uniform top-level shape (`success` discriminant) regardless of route. This lets API clients branch on a single field and gives the orval-generated client one discriminated union to model. It also centralizes how status codes map to stable error codes and messages so no handler can leak an ad-hoc shape.

## Key elements

- **`ResponseNeutral`** — Shared fields (`success`, `status`, `message`) present on both success and failure envelopes.
- **`ResponseSuccess<T>`** — Success variant; `data?: T`, `errors: never` (deliberate, drives TS narrowing).
- **`ResponseReject`** — Failure variant; `data: undefined` (explicit key for union safety), `errors: ResponseErrorItem[]`.
- **`ResponseErrorItem`** — Single structured error: `{ code, message, details? }`. Clients must branch on `code`, never `message`.
- **`generateSuccess<T>(data, status?, message?)`** — Builds a success envelope object without an Express `Response` (usable in tests/workers).
- **`successResponse(response, data, status?, message?)`** — Applies status to the Express response and sends the success envelope.
- **`generateReject(status?, errors?)`** — Builds a reject envelope; defaults to 400. No `message` parameter (derived from status).
- **`rejectResponse(response, status?, errors?)`** — Sends the reject envelope. Does **not** throw; caller must `return` it.
- **`resolveErrorMessage(status)`** — Returns the single canonical reason phrase for a status code.
- **`validationErrors(zodError)`** — Converts a `ZodError` into `ResponseErrorItem[]`, joining `path` with dots into `details.field`.
- **`STATUS_ENVELOPE`** (internal) — Map of known 4xx codes to `{ code, message }`. 422 and 429 intentionally omit a specific `code`.
- **`normalizeErrors`** (internal) — Coerces strings or partial items into full `ResponseErrorItem[]`, guaranteeing a non-empty array.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Consumes `successResponse`, `rejectResponse`, and the envelope types as its return-signature contract.
- **`src/app/error-handling.ts`** — Calls `rejectResponse` / `generateReject` to convert uncaught errors into the envelope before Express' default handler fires.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Sends 429 via `rejectResponse`; the generic code (no specific 429 code in `STATUS_ENVELOPE`) is what clients receive.
- **`src/kernel/middlewares/authorizations.ts`** — Sends 401/403 via `rejectResponse` using the `UNAUTHORIZED` / `FORBIDDEN` codes.
- **`src/infrastructure/surfaces/create-*-controller.ts`** (all four) — Build responses with `successResponse` and `rejectResponse`; use `validationErrors` to serialize Zod failures from `safeParse`.
- **`src/modules/account/controllers/delete-*.ts`** — Call the same response helpers for their specific account-deletion flows.
- **`src/infrastructure/http/request.ts`** — Companion file handling the request side (parsing, context); this file handles the response side.
- **`src/app/routes.ts` / `src/app/system-routes.ts`** — Route handlers whose return types are `Response<ResponseSuccess<T>>` or `Response<ResponseReject>`.

## Notes

- **`rejectResponse` does not throw.** Forgetting to `return` it lets execution continue and triggers Express' "headers already sent" error. Controllers must write `return rejectResponse(...)`.
- **`errors: never` in `ResponseSuccess`** is not a bug — it makes the union narrow on `success` and prevents accidentally constructing a success with errors. The `as` cast in `generateSuccess` is required because no literal satisfies `never`.
- **`data: undefined` in `ResponseReject`** is an explicit key so that `result.data` type-checks on both branches of the discriminated union (avoids "property does not exist" errors).
- **Status is set twice** — on the HTTP header *and* in the JSON body — so the body survives proxies that rewrite status codes.
- **`message` on rejects is derived, not caller-supplied.** Callers pass `errors[]` for user-facing text; the envelope-level `message` is always the canonical reason phrase for the status.
- **422 and 429 have no dedicated `code`** in `STATUS_ENVELOPE` by design — clients branch on "the request was wrong", not on which flavour. They fall through to `REQUEST_ERROR`.
- **`generateSuccess` / `generateReject`** are split from their `*Response` send counterparts specifically so unit tests and non-HTTP workers can assert on the envelope shape without an Express `Response`.
