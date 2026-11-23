---
source: src/modules/addresses/tests/integration/idempotent-create.test.ts
generated_at: 2026-11-22T04:16:50.768567+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/tests/integration/idempotent-create.test.ts

## Purpose
Integration test for `POST /account/addresses` when called with an `Idempotency-Key` header. It checks that a retry with the same key replays the first response instead of writing a duplicate address (which would use up a slot of the per-account address cap). It also checks that a new key still creates a new entry.

## Key elements
- `setupTestDb()` is called at module top level to set up the test database.
- `add(bearer, key)` is a helper that POSTs the `HOME` fixture to `/account/addresses` with the given `Authorization` bearer and `Idempotency-Key` headers.
- `addressesOf(userId)` is a helper that calls `addressService.list(userId)` and returns the `addresses` array.
- Test "writes one entry and replays its answer to a retry":
  - Authenticates as `'user'` and sends the same key twice through `sendTwice`.
  - Expects both responses to be `201`.
  - Expects the retry to carry `idempotent-replayed: true` and a body equal to the first response's body.
  - Expects exactly one stored address.
- Test "writes another entry for a new key: two clicks make two":
  - Sends `address-key-1` twice, then `address-key-2` once.
  - Expects the third request to return `201`.
  - Expects two stored addresses.

## Relationships
- `src/modules/addresses/service.ts`: `addressService.list` is used to read stored state directly, bypassing HTTP, to count entries.
- `src/modules/addresses/tests/integration/fixtures.ts`: supplies the `HOME` address payload sent as the request body.
- `tests/support/http.ts` (`@tests/http`): provides `api()` as the request client and `authenticateAs('user')`, which returns `{ user, bearer }`.
- `tests/support/replay.ts` (`@tests/replay`): provides `sendTwice`, which runs the request factory twice and returns `{ first, retry }`.
- `tests/support/setup-test-db.ts` (`@tests/setup-test-db`): provides `setupTestDb`, which prepares the DB for the suite.

## Notes
- Each test calls `authenticateAs` for itself, and both tests reuse the key `address-key-1`. The key is therefore scoped per user or caller, not global, otherwise the second test would replay the first test's response. The file doesn't show how scoping is implemented.
- Persistence is checked through the service layer rather than through the API.
