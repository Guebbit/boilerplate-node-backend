# tests/support/http.ts

## Purpose

HTTP-level test harness for contract tests. It drives the fully mounted Express app through supertest so that requests pass through routing, middleware, auth, serialization, and the error handler — the only layer where a response can be meaningfully compared against `openapi.yaml`. Unit suites call services and repositories directly and bypass this stack.

## Key elements

- **`api()`** — Returns a supertest agent bound to the imported Express `app`. This is the entry point every contract test uses to issue HTTP requests.
- **`authenticateAs(role?)`** — Creates a user (or admin) via the users test factory, then logs in through the real `POST /account/login` route. Returns `{ user, token, bearer }`. Throws a descriptive error if login returns non-200 or omits a token.

## Relationships

- **`src/app.ts`** — Imports the mounted Express `app`. In test mode (`NODE_ENV === 'test'`) the app skips auto-start, so importing it starts no server, Mongo, Redis, or queue.
- **`src/modules/users/tests/factory.ts`** — Imports `createUser`, `createAdminUser`, and `PLAIN_PASSWORD` to create test fixtures and authenticate.
- **Contract tests across all modules** (`account`, `cart`, `delivery`, `feedback`, `inventory`, `locales`, `observability`, `orders`, `payments`, `products`, `users`, `wishlist`) — Each `api.contract.test.ts` file imports `api` and/or `authenticateAs` to drive requests and obtain auth headers.
- **`docs/tools/contract-testing.md`** — Documents the contract-testing approach this harness implements.

## Notes

- **Redis is optional.** `getCacheValue` resolves `undefined` on any failure, so the app treats it as a cache miss. No real Redis instance is needed for these tests.
- **`authenticateAs` intentionally goes through the real login endpoint** rather than signing a JWT manually. If the login route stops issuing usable tokens, every contract test fails — by design.
- The in-memory test database (`setupTestDb`) is referenced in the header comment as context for how the DB is provisioned, but is not imported by this file.
