---
source: src/modules/addresses/tests/integration/idempotent-create.test.ts
sha256: 233cc101121f45f915e1cccb2e9be5b0d11e99089d057e351b01757990cc01f9
generated_at: 2026-11-14T19:20:01.081290+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/integration/idempotent-create.test.ts

## Purpose

Integration test that verifies `POST /account/addresses` honours the `Idempotency-Key` header: a retry after a lost response replays the original entry (201 + `idempotent-replayed: true`) instead of writing a duplicate, while a different key still creates a new address. It guards against the cap-burning scenario where a client double-submits the same logical address.

## Key elements

- **`add(bearer, key)`** — helper that POSTs the `HOME` fixture to `/account/addresses` with the given bearer token and `Idempotency-Key`.
- **`addressesOf(userId)`** — reads the caller's stored addresses via `addressService.list` so the test can assert on row count rather than only HTTP status.
- **Test: "writes one entry and replays its answer to a retry"** — calls `sendTwice` with key `address-key-1`; asserts both responses are 201, the retry carries `idempotent-replayed: true`, bodies are identical, and exactly **1** address is stored.
- **Test: "writes another entry for a new key: two clicks make two"** — reuses key `address-key-1` (already replayed) then submits key `address-key-2`; asserts **2** addresses are stored.

## Relationships

| Neighbour | Interaction |
|---|---|
| `src/modules/addresses/service.ts` | Imports `addressService` and calls `.list(userId)` to verify persisted row count. |
| `src/modules/addresses/tests/integration/fixtures.ts` | Imports the `HOME` constant used as the canonical address payload for every request in this file. |
| `tests/support/http.ts` | Imports `api` (supertest-style HTTP client) and `authenticateAs` (creates a user + bearer token). |
| `tests/support/replay.ts` | Imports `sendTwice`, which fires the same request twice to simulate a client retry after a lost response. |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` at module scope to seed/tear down the test database for this file. |

## Notes

- The test asserts on the custom `idempotent-replayed` response header as the signal that a replay occurred; the server is responsible for setting it.
- `sendTwice` is the only mechanism that simulates a "lost answer" — it does not actually drop a network response, it just invokes the request function twice and returns `{ first, retry }`.
- Both tests share the same user (`authenticateAs('user')`) but are independent; the DB is reset between them by the test-runner's `setupTestDb` teardown.
