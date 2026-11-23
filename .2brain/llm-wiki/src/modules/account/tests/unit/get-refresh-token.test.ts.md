---
source: src/modules/account/tests/unit/get-refresh-token.test.ts
source_sha256: 0481976624c0cf5f26c2774ff051f3fa4e0e0f8c64b2a8cdb95dc6802e6ad9d5
context_sha256: 91d99344fa0f053df979a38b59019564e1a90751f798080b5b7e875dfaa72055
generated_at: 2026-11-22T04:05:51.934577+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/get-refresh-token.test.ts

## Purpose
Unit test for the outage branch of `POST /account/refresh`. It verifies that when the refresh fails because the database is down or slow, the controller returns a retryable 503 (not a 401, which clients read as "signed out"). It also verifies that the failure is logged through the shared `rejectDatabaseError` path like other controllers.

## Key elements
- `queryTimeout()` — builds an `Error` with Mongo's `code: 50` (`MaxTimeMSExpired`), the error a query killed at its time limit carries.
- `refreshFailing(failure)` — spies on `accountService.refreshAccessToken` to reject with `failure`, then calls `getRefreshToken` with a stub request (`cookies: {}`, `headers: {}`) and a stub response. Returns the response stub.
- `describe('getRefreshToken — an outage')` — the suite. Its `beforeEach` sets `NODE_SESSION_MODE: 'jwt'` and silences `logger.error`. Its `afterEach` calls `jest.restoreAllMocks()`.
- Test "answers a killed query with the 503 QUERY_TIMEOUT item" — asserts `status(503)` and that the serialized JSON body contains `QUERY_TIMEOUT`.
- Test "logs the outage under the operation name" — rejects with a `MongoServerSelectionError` and asserts `logger.error` was called with a message containing `refreshAccessToken` plus a second argument.

## Relationships
- `src/modules/account/controllers/get-refresh-token.ts` — the unit under test (`getRefreshToken`).
- `src/modules/account/services/index.ts` — exports `accountService`, whose `refreshAccessToken` method is spied on to reject.
- `src/infrastructure/adapters/logger.ts` — exports `logger`, whose `error` method is spied on and stubbed so the log assertion can be made.
- `tests/support/stub.ts` (`asStub`) — casts the partial request object to `Request`.
- `tests/support/express.ts` (`makeResponseStub`) — provides the response stub whose `status` and `json` are asserted on.
- `tests/support/environment.ts` (`setEnvironment`) — sets the session mode env var.

## Notes
- Only the outage path is covered here. The success and auth-failure paths are not tested in this file.
- The 503 assertion matches on the stringified JSON body rather than its exact shape.
