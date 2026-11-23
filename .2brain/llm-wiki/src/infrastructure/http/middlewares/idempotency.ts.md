---
source: src/infrastructure/http/middlewares/idempotency.ts
source_sha256: 3a2a6189c3afa6493393868c7b1f04360a221140bebc419268eeeffef02688ee
context_sha256: 6cecd978c4c888710ed3875cb6bc0c1a6322b7a15ecbe4ee3eaf113fbd30590a
generated_at: 2026-11-22T02:50:04.217206+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/idempotency.ts

## Purpose
Express middleware that makes retried writes safe via the `Idempotency-Key` header. It is mounted per route (never globally). The record ledger lives in Mongo rather than Redis, because the Redis cache runs `allkeys-lru` and could evict a live record and cause a silent duplicate write. Most routes are opt-in at the header level. A do-not-retry route uses `requireIdempotencyKey`, refuses a missing key with 400, and never re-runs a key past its lease. Instead it answers a stored 409 "outcome unknown" and notifies staff.

## Key elements
- `IDEMPOTENCY_KEY_HEADER` / `KEY_PATTERN`: read the header and accept a key in either quoted (Structured Field String) or bare form. The inner value is 1–200 chars of `[\w-]`.
- `hasPrototypeKey(value)`: recursively detects an own `__proto__` key in a body. `canonicalize` from `@guebbit/js-toolkit` silently drops that key, so such bodies are refused rather than mis-fingerprinted.
- `fingerprintOf(request)`: a keyed hash (via `pseudonymise('idempotency', …)`) of method, concrete `baseUrl + path`, and the canonicalized JSON body. It is keyed so that a database dump cannot be used to guess passwords from `/signup` bodies. It uses the concrete path rather than the route template.
- `callerKeyOf(request)`: `request.caller?.id`, or `ip:<ip>` for public routes. It scopes the `(key, caller)` unique index so one caller cannot read another's cached reply.
- `DoNotRetrySubject`, `OutcomeUnknownFacts`, `OutcomeUnknownSink`: the types for the do-not-retry operation, its facts (tenant, subject id, `since`, `recordId`), and the port through which staff are notified.
- `registerOutcomeUnknownSink(sink)`: registers the sink. A module outside `infrastructure` calls it, and the sink must not throw or reject. No sink registered is a supported state.
- `Claim` / `DoNotRetryFacts`: internal shape of what a request knows when it claims a key.
- `settleIdempotencyMarks(timeoutMs)`: waits, up to a timeout, for the in-progress done-mark writes tracked in `pendingMarks`. It is intended for shutdown.
- `REPLAYED_HEADERS` / `replayedHeadersOf(response)`: the headers copied into the stored record and replayed on a retry (`WWW-Authenticate`, `Allow`, `ETag`, `Content-Location`). `Retry-After` is deliberately excluded.
- `IN_FLIGHT_LEASE_MS` (5 minutes) / `isAbandoned(record)`: an `in_flight` record older than the lease is treated as abandoned. An ordinary key may then re-run, while a do-not-retry key answers "outcome unknown".
- `requireIdempotencyKey`: the do-not-retry variant, referenced in the header docs. Its definition lies beyond the part of the file shown here.

## Relationships
- `idempotency-model.ts`: provides `idempotencyRecordModel` and `IdempotencyRecordDocument`, the Mongo-backed ledger with TTL expiry.
- `response.ts`: provides `markDoNotRetry` and `rejectResponse`.
- `preconditions.ts`: provides `keepEtag`.
- `mongo-errors.ts`: provides `isDuplicateKey`.
- `logger.ts`: the logger.
- `pseudonymise.ts`: the keyed hash used for fingerprints.
- `settle.ts`: provides `settleWithin`, which backs `settleIdempotencyMarks`. `server-lifecycle.ts` is the likely caller at shutdown, but this is not visible in the shown content.
- `time.ts`: provides `MINUTE_MS`.
- `src/modules/account/routes.ts`, `src/modules/addresses/routes.ts`: route modules that mount this middleware.

## Notes
- The ledger never records a 429: budgets refuse before the key is claimed, and handlers must not answer 429 after a write.
- The same key with a different fingerprint is treated as a client bug, not papered over.
- The done-mark is written after the response is sent, so shutdown should call `settleIdempotencyMarks`. Otherwise a key can be left `in_flight`, and on a do-not-retry route a retry becomes a false "outcome unknown".
