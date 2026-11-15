---
source: tests/integration/bad-bodies.test.ts
sha256: 9d4e6a646f0bb821029c7cb516170d1e7881729abd6899e352daeb3461a5f6b9
generated_at: 2026-11-14T23:10:31.245821+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/bad-bodies.test.ts

## Purpose

Integration tests that verify every category of malformed request body produces a client error (4xx) — never a 500 — so that no single bad request can inflate the 5xx rate. Covers oversized bodies, malformed JSON, non-object JSON values, unsupported charset/encoding, unsupported content-type, malformed multipart, and the Express 5 edge case where `request.body` is `undefined` (not `{}`) because no parser matched.

## Key elements

- **`OVERSIZED_BODY`** – a ~200 kb JSON string guaranteed to exceed `NODE_JSON_BODY_LIMIT` (100 kb default) to trigger the 413 path.
- **`BODY_READING_ROUTES`** – the four routes that destructure `request.body` without a preceding Zod parse; used as the parameter list for the "body express never parsed" tests. Includes both unauthenticated and auth-guarded (user/admin) routes, and both multipart and JSON routes.
- **`describe('a body the parser refused')`** – 413 (size), 400 (malformed JSON), 422 (valid JSON that is not an object: number, string, boolean, null, array), 415 (unsupported charset *and* unsupported content-encoding as separate cases), a contract check that `415` is declared on `POST /account/login` in `openapi.yaml`, and a message-hygiene test that body-parser's internal error text is not leaked.
- **`describe('a malformed multipart body')`** – 400 responses for missing-boundary and truncated multipart bodies across `PUT /account` and `POST /products`.
- **`describe('a body express never parsed')`** – 415 on `text/plain` bodies for every route in `BODY_READING_ROUTES`, a case-insensitive path check (`/Account`), and a "no content-type at all" test asserting `< 500` and not `401` (proving the request reached the controller, not the auth middleware). The truncated tail contains the enumeration property (malformed login answers identically whether or not the account exists).

## Relationships

- **`tests/support/http.ts`** – `api()` builds the supertest request; `authenticateAs(role)` returns a bearer token for guarded routes.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` runs once before the suite to provision a clean database.
- **`tests/support/ids.ts`** – `MISSING_ID` is a sentinel ID placed in URL paths for routes that require one (`/users/{id}`, `/orders/{id}/cancel`).
- **`tests/support/problem.ts`** – `withoutInstance` is imported for use in the truncated portion (likely stripping an instance field from a problem+json response).
- **`tests/support/stub.ts`** – `asStub` is imported for use in the truncated portion.
- **`src/modules/users/tests/factories.ts`** – `createUser` and `PLAIN_PASSWORD` are imported for the enumeration test in the truncated tail (creating a real user to prove the answer is the same with and without an existing account).

## Notes

- **Express 5 vs 4:** when no body parser matches, Express 5 leaves `request.body` as `undefined`, not `{}`. An unguarded destructure throws a synchronous `TypeError` before any `.catch` can intercept it. The fix is a per-route guard, not a blanket 400.
- **Deliberate non-assertion:** a bodyless login (422) is *not* the same answer as a wrong-password login (401). The split is intentional — `accountService.login` parses `LoginBody` itself — and the file explicitly documents that it must not be collapsed.
- **Contract test in-line:** the 415 status is asserted against the bundled `openapi.yaml` here (rather than in a separate contract test) because the status and its `x-app-level-responses` declaration were added together and should fail together.
- **Message hygiene:** the test asserts the response body contains neither the word "JSON" nor "position" to prevent forwarding body-parser's internal error text, which could leak driver details in a regression.
- **Multipart is not a free pass:** multer calls `next()` untouched when the content-type is not multipart, so `PUT /account` and `POST /account/signup` are explicitly included in `BODY_READING_ROUTES`.
- **Auth-before-parse ordering:** guarded routes (`PUT /account`, `POST /users`) are tested *with* a valid session so that a body-parsing bug behind the guard cannot be masked by a 401 from the auth middleware.
