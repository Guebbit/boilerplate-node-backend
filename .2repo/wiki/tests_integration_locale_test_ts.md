# tests/integration/locale.test.ts

## Purpose

Integration tests verifying that per-request locale negotiation (via the `Accept-Language` header) works end-to-end through the real middleware stack, Zod validation, and error-shaping path. The file exists to guard against regressions where locale resolution silently falls back to the boot language—especially under concurrency (AsyncLocalStorage) and across the multipart-upload boundary.

## Key elements

- **`INVALID_SIGNUP` / `INVALID_CONTACT`** — fixed payloads that trigger 422 validation errors without touching any repository, Redis, or queue.
- **`signupWith(acceptLanguage?)`** — returns a supertest `pending` request to `POST /account/signup` with an optional `Accept-Language` header.
- **`contactWith(acceptLanguage?)`** — same pattern for `POST /feedback/contact`.
- **`messagesOf(body)`** — extracts the array of human-readable error strings from a `{ errors: [{ message }] }` response body.
- **`describe('Accept-Language negotiation', …)`** — covers: Italian request, default (no header), unsupported-language fallback, q-weight ordering, region-tag matching (`it-CH` → `it`), `Vary: Accept-Language` cache header, multipart-upload locale preservation, and a 20-request concurrency test (alternating `en`/`it` in flight simultaneously).
- **`describe('generated-schema validation answers in the negotiated language', …)`** — covers: Italian/English responses from the orval-generated schema on `/feedback/contact`, a "no Zod default leaks" cross-language diff assertion, and precedence of field-specific `t(...)` messages over the global shared-validation map.

## Relationships

- **`tests/support/http.ts`** — supplies the `api()` factory (a pre-configured supertest instance) used by both `signupWith` and `contactWith` to issue requests against the running app.

## Notes

- Every test posts an *invalid* body so the response is a 422 shaped by Zod + `rejectResponse`; no database, Redis, or queue is needed.
- The multipart test exists because `multer` consumes the request stream, causing the async context (and thus the AsyncLocalStorage locale) to drop before the Zod thunks resolve. The JSON path never hits this because `express.json()` buffers first.
- The concurrency test is the primary guard against replacing `AsyncLocalStorage` with a single `i18next.changeLanguage()` global.
- The "no Zod default on the wire" test asserts that every Italian message *differs* from its English counterpart at the same index, rather than naming specific copy—so it stays valid as dictionary strings change.
- The precedence test (`field-specific beats shared map`) runs against the signup endpoint specifically, because `/feedback/contact` has no per-field `t(...)` declarations.
