---
source: src/modules/account/tests/unit/get-refresh-token.test.ts
sha256: 0481976624c0cf5f26c2774ff051f3fa4e0e0f8c64b2a8cdb95dc6802e6ad9d5
generated_at: 2026-11-14T19:15:09.331364+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/get-refresh-token.test.ts

## Purpose

Unit tests for the `getRefreshToken` controller covering the **outage branch**: when the underlying database refresh query fails (timeout or server-selection error), the response must be a retryable **503** (not a 401, which clients interpret as "signed out"), and the error must be logged through `rejectDatabaseError`.

## Key elements

- **`queryTimeout()`** – Factory returning a synthetic Mongo `MaxTimeMSExpired` error (`code: 50`), used to simulate a killed query.
- **`refreshFailing(failure)`** – Mocks `accountService.refreshAccessToken` to reject with the given error, invokes `getRefreshToken` with a stubbed request/response, and returns the response stub.
- **`describe('getRefreshToken — an outage')`** – Two assertions:
  - A killed query yields HTTP 503 with a `QUERY_TIMEOUT` item in the JSON body.
  - A `MongoServerSelectionError` causes `logger.error` to be called with a message containing the operation name `refreshAccessToken`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/controllers/get-refresh-token.ts` | Unit under test; called directly with a stub request. |
| `src/modules/account/services/index.ts` | Exports `accountService`; its `refreshAccessToken` method is mocked to inject the failure. |
| `src/infrastructure/adapters/logger.ts` | Exports `logger`; its `error` method is spied on to verify the outage is logged. |
| `tests/support/environment.ts` | `setEnvironment` sets `NODE_SESSION_MODE: 'jwt'` so the controller takes the JWT path. |
| `tests/support/express.ts` | `makeResponseStub` supplies the Express response object for assertions. |
| `tests/support/stub.ts` | `asStub` casts the minimal request object to satisfy the `Request` type. |

## Notes

- The test scope is **outage-only**; the happy-path (valid token returned) is covered elsewhere.
- `NODE_SESSION_MODE: 'jwt'` is required in `beforeEach` — without it the controller may take a different code path that doesn't exercise the database.
- The module doc comment emphasizes the 503-vs-401 contract: clients treat 401 as sign-out, so an outage must never surface as one.
- `jest.restoreAllMocks()` in `afterEach` ensures the `accountService` and `logger` spies don't leak between suites.
