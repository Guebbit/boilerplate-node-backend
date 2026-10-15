---
source: tests/integration/bad-bodies.test.ts
sha256: 296971676fa302135fb7ede34bbe1a35bcf4391bb11b909a828a95cb220c92ad
generated_at: 2026-10-15T12:44:01.886958+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/bad-bodies.test.ts

## Purpose

Integration test that pins the contract for requests whose bodies the parser refuses or never parses: the correct client-error status (413, 400, 415, 422) and—critically—that the response is never a 500. It exists so that a single malformed request can never inflate the 5xx error rate in metrics or alerting. It also covers hostile but well-formed content (excessive nesting depth, bracket-overflow) and verifies that the OpenAPI spec declares every status the app can emit for the operation that answered it.

## Key elements

- **`OVERSIZED_BODY`** – A JSON string (~200 KB) built to exceed `NODE_JSON_BODY_LIMIT`, used to trigger the 413 path.
- **`BODY_READING_ROUTES`** – Array of the four routes (`POST /account/login`, `POST /account/signup`, `PUT /account`, `POST /users`) that destructure `request.body` without a prior Zod parse. Includes per-route auth (`authenticateAs` helper or `undefined`). Multipart routes are included deliberately because multer passes through untouched when the content-type isn't multipart.
- **`describe('a body the parser refused')`** – Tests 413 (oversized), 400 (malformed JSON), 415 (unsupported charset *and* content-encoding as separate throw sites), OpenAPI contract declaration of 415 under `POST /account/login`'s own `responses`, and that the error body leaks no parser-internal text.
- **`describe('a body express never parsed')`** – Tests that `text/plain` bodies hit 415 (not 500) on every body-reading route, that a completely missing content-type does not 500 or 401, the **enumeration property** (malformed login gives an identical response for a known and an unknown address), and a happy-path regression (correct credentials still log in).
- **`describe('hostile content in a well-formed body')`** – Tests the `limitJsonDepth` guard (depth > 32 → 400 with `body-too-deep` detail), the 100 KB `[[…]]` bracket-overflow body across two routes, and that within-limit nesting is still accepted.

## Relationships

- **`tests/support/http.ts`** – Supplies `api()` (the supertest-style HTTP client) and `authenticateAs(role)` (creates a real session and returns a bearer token) used throughout the suite.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module top-level to provision a clean test database before any test runs.
- **`src/modules/users/tests/factories.ts`** – `createUser()` provisions a verified test account; `PLAIN_PASSWORD` is the known plaintext password for that factory user. Both are used in the enumeration and happy-path tests.

## Notes

- **Express 5 `request.body` is `undefined`, not `{}`**, when no body-parser middleware matched. An unguarded destructure (`const { email } = req.body`) throws a synchronous `TypeError` before any `.catch()` in a promise chain can see it. The fix is a per-read guard, not a blanket 400—the request must still reach the route's own handler.
- The enumeration property is the test that *actually* matters: a malformed login must answer identically whether the address exists. A 500 broke this by construction; a fix that answers 400 for one shape and 422 for another is only safe if neither depends on the account.
- A bodyless login (422) is intentionally **not** the same as a wrong-password login (401). `accountService.login` parses `LoginBody` itself, and that split is documented as intentional in `postLogin`.
- The contract test reads `openapi.yaml` from disk and asserts 415 is under the operation's **own** `responses` (not merely present in `$ref`-ed components), because a broken merge would still leave the component declared but unattached.
- `charset=utf-7` is accepted by body-parser; `charset=utf-32` decodes to nonsense and yields 400 `entity.parse.failed`, not 415. Only `iso-8859-1` and `Content-Encoding: nonsense` reach the 415 path.
- The 415 for content-type mismatches is an **app-level** response (no `account` fragment declares it), reaching the OpenAPI spec via `x-app-level-responses`.
