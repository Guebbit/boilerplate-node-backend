---
source: src/infrastructure/http/middlewares/idempotency.ts
sha256: 77ff7bd2853cc18fac80afc431a2817f69a3f9e5651ec13763069ad779f42b6d
generated_at: 2026-11-14T18:01:45.350745+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/idempotency.ts

## Purpose

Per-route Express middleware that makes retried writes safe by storing a keyed ledger of request outcomes in Mongo. Mounted per route (never globally) because GETs and already-idempotent routes should not pay for replay protection. Supports two modes: opt-in (absent key → no protection, no refusal) and mandatory (`requireIdempotencyKey`, refuses with 400 if the key is missing). For do-not-retry operations, an expired in-flight lease yields a stored 409 "outcome unknown" rather than re-running the handler.

## Key elements

- **`IDEMPOTENCY_KEY_HEADER`** / **`KEY_PATTERN`** – Header name and regex accepting both quoted (RFC 9651 Structured Field) and bare key forms, 1–200 word/`-` chars.
- **`hasPrototypeKey(value)`** – Recursive guard that rejects any body containing an own `__proto__` property, working around a `canonicalize` bug that would silently drop the key and produce a colliding fingerprint.
- **`fingerprintOf(request)`** – Builds a pseudonymised string from method + concrete path (`baseUrl + path`, not the route template) + canonicalised body. Pseudonymised rather than bare-hashed so a Mongo dump cannot be offline-cracked for secrets in the body.
- **`callerKeyOf(request)`** – Resolves the caller identity (account id or `ip:<addr>`) used as the second half of the unique `(key, caller)` index, preventing cross-tenant key guessing.
- **`DoNotRetrySubject`** (exported) – Route-supplied descriptor (`operation`, `subjectParam`) identifying the action and its target parameter for outcome-unknown notices.
- **`OutcomeUnknownFacts`** (exported) – Extends `DoNotRetrySubject` with `tenantId`, `subjectId`, `since`, `recordId` for the sink callback.
- **`OutcomeUnknownSink`** (exported type) – Fire-and-forget callback the infrastructure layer cannot import directly; the consuming module registers itself.
- **`registerOutcomeUnknownSink(sink)`** (exported) – Installs the sink; unregistered state is valid (unit tests, non-shop projects).
- **`settleIdempotencyMarks(timeoutMs)`** (exported) – Awaits all in-flight done-mark writes (tracked in `pendingMarks`) before the process exits, preventing a stranded `in_flight` record.
- **`REPLAYED_HEADERS`** – Whitelist of headers preserved on replay: `WWW-Authenticate`, `Allow`, `ETag`, `Content-Location`. `Retry-After` is deliberately excluded.
- **`IN_FLIGHT_LEASE_MS`** (5 min) – TTL after which an `in_flight` record is considered abandoned; a retry on an ordinary key re-runs the handler, a do-not-retry key gets 409.
- **`isAbandoned(existing)`** – Checks state + `updatedAt` against the lease.
- **`replayedHeadersOf(response)`** – Extracts only the whitelisted headers currently set on the response.
- **`Claim`** / **`DoNotRetryFacts`** (internal) – Aggregated identity tuple (key, caller, fingerprint) plus optional do-not-retry metadata passed through the claim flow.

## Relationships

- **`idempotency-model.ts`** – Defines `idempotencyRecordModel` (Mongoose model) and `IdempotencyRecordDocument`; this file is the sole operational consumer.
- **`@infrastructure/http/response`** – Uses `markDoNotRetry` (to flag the response before storage) and `rejectResponse` (for 400/409 answers).
- **`@infrastructure/http/preconditions`** – `keepEtag` is imported, likely to preserve ETag handling across replayed responses.
- **`@infrastructure/persistence/mongo-errors`** – `isDuplicateKey` detects a concurrent claim (unique-index violation) and routes into the replay/409 path.
- **`@infrastructure/security/pseudonymise`** – Produces the keyed fingerprint so raw secrets never land in Mongo.
- **`@infrastructure/adapters/logger`** – Structured log events for claim, conflict, and outcome-unknown paths.
- **`@infrastructure/i18n`** – `t` for localised error/status messages in responses and notices.
- **`@domain-primitives/time`** – `MINUTE_MS` constant for the in-flight lease duration.
- **`@infrastructure/runtime/settle`** – `settleWithin` underpins `settleIdempotencyMarks` for graceful shutdown.
- **`src/infrastructure/runtime/server-lifecycle.ts`** – Expected caller of `settleIdempotencyMarks` during shutdown drain.
- **`src/modules/account/routes.ts`** – Representative consumer that mounts the middleware on specific write routes.
- **`scripts/audit/api-standards.yaml`** – Declares the `Idempotency-Key` header contract this middleware enforces.

## Notes

- **Mongo, not Redis, by design.** The cache container uses `--maxmemory-policy allkeys-lru`; an LRU-evicted idempotency record would become a silent duplicate write under load. The ledger is a source of truth and lives next to other TTL-expiring durable data.
- **Never returns 429 after a write.** All rate-budget checks happen before the key is claimed; once a handler has run, the only answers are the stored outcome or a 409.
- **Concrete path in the fingerprint, not the route template.** Two orders at `/order/A/refund` and `/order/B/refund` have identical (empty) bodies; a template-based fingerprint would replay A's answer for B.
- **Pseudonymised fingerprint, not a bare hash.** `POST /signup` carries a plaintext password; a raw SHA-256 in Mongo would enable offline dictionary attacks at hash speed.
- **`hasPrototypeKey` is a hard refusal, not a warning.** The upstream `canonicalize` library drops an own `__proto__` key into its accumulator, causing two distinct bodies to fingerprint identically. The middleware refuses the request until the library is fixed.
- **Outcome-unknown sink is fire-and-forget.** Implementations must not throw or reject; the 409 response is already being sent.
- **The in-flight lease (5 min) is far above any real handler timeout.** A request still running past that point is already past every upstream timeout; treating it as dead is the safe default.
- **`Retry-After` is stripped on replay.** A stored 503 must not advertise "retry later" for the entire retention window under a key that can never succeed.
