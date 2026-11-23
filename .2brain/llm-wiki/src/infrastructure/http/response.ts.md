---
source: src/infrastructure/http/response.ts
source_sha256: 02db442c3e79f4399b1202e089cfb35d2671976829192e87f570531dc542bb03
context_sha256: d6e22721a6548933ff442d3d1c3238d907e26826b1820e0b1159db0eb238579f
generated_at: 2026-11-22T02:53:59.150477+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/response.ts

## Purpose
Response serialisers for the HTTP layer. A success goes on the wire as the resource itself (or a list object, or an empty 202/204). A failure goes out as RFC 9457 problem details (`application/problem+json`), with an `errors` extension carrying machine codes. Internally both outcomes share one `ServiceResult` union discriminated on `success`. Only the serialisers in this file write anything to the wire.

## Key elements
- **`ResponseNeutral`, `ResponseSuccess<T>`, `ResponseReject`**: the internal result shapes.
  - `success` is a literal type, so TypeScript can narrow on it alone.
  - `ResponseSuccess` has `data` and forbids `errors`.
  - `ResponseReject` has `message` (the problem title), `data: undefined` (present on purpose, to keep `result.data` union-safe), and a non-empty `errors` array.
- **`ResponseErrorItem`**: one error with `code` (typed against the generated `ErrorCode` catalogue), a translatable `message`, and optional `details`.
- **`generateSuccess(data, status=200)`**: builds a success result without an Express `Response`, which suits tests and workers.
- **`generateReject(status=400, errors=[])`**: builds a reject result. The title comes from `resolveErrorTitle`, and the errors are normalised.
- **`successResponse(res, data, status=200)`**: sends `res.status(status).json(data)`, typed as `Response<T>`.
- **`createdResponse(res, data, location)`**: sends a 201 with a `Location` header.
- **`createdOrOk(res, data, status, location)`**: delegates to `createdResponse` when `status === 201`, otherwise to `successResponse`.
- **`acceptedResponse(res)`**: sends 202 with no body, via `.end()`.
- **`noContentResponse(res)`**: sends 204 with no body, via `.end()`.
- **`resolveErrorTitle(status)`**: returns the English RFC 9110 status phrase.
  - 413 and 422 are overridden to "Content Too Large" and "Unprocessable Content".
  - Statuses Node has no phrase for fall back to "Server Error" or "Client Error".
- **Internal helpers**:
  - `resolveErrorCode` derives an UPPER_SNAKE code from the status title. It falls back to `CLIENT_ERROR`, and maps any 5xx other than 503 to `INTERNAL_SERVER_ERROR`.
  - `resolveErrorText` returns the translated `generic.error-<code>` string via `t()`.
  - `normalizeErrors` accepts strings or structured items and always returns at least one `{code, message}` item, filling gaps from the status.
- A helper for 429 responses is documented as "the only door to a 429". `rejectResponse` turns `details.retryAfter` into `Retry-After`. The rest of the file is not shown here.

## Relationships
- It imports `ERROR_CODES` and `ErrorCode` from `@api/error-codes`, `t` from `@infrastructure/i18n`, and `labelNeutralRefusal` from `@infrastructure/http/middlewares/locale`.
- The doc comments say the idempotency ledger wraps both `json` and `end`. This is why `acceptedResponse` and `noContentResponse` use `.end()`, so keyed routes are still recorded and replayed bodiless (`src/infrastructure/http/middlewares/idempotency.ts`).
- The other neighbours (`controller.ts`, `errors.ts`, `error-handling.ts`, the route files, `worker-process.ts` and the other middlewares) are in the dependency graph. The visible content does not show how they use this file.

## Notes
- Clients should branch on `errors[].code`, never on `message`.
- The problem `title` is always English because it names the status class. The translated text is `detail`.
- The reject `status` is mirrored in the body so it survives proxies that rewrite HTTP status codes.
- `generateReject` deliberately has no `message` parameter.
- `.end()` is used instead of `.json(undefined)` because Express 5 would answer that with a JSON content type and zero bytes.
