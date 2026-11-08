---
source: src/infrastructure/http/middlewares/idempotency.ts
sha256: 92a9c31f67b53639b677fb01f650834be4cba0d01a577e0571af35851bb6d830
generated_at: 2026-11-08T03:31:08.088549+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/idempotency.ts

## Purpose

Express middleware that implements `Idempotency-Key` replay protection for write endpoints. When a client supplies the header, the middleware stores the handler's response in a Mongo-backed ledger; a retry with the same key gets the stored answer instead of re-executing the handler. It is mounted **per-route** (like `uploadLimiter`) and is **opt-in**: a request with no header receives neither protection nor refusal.

## Key elements

- **`fingerprintOf(request)`** – Builds a stable request fingerprint from `method + baseUrl + path + canonicalized body`, then wraps it with `pseudonymise('idempotency', …)` so the stored value is a keyed (non-invertible) digest rather than a bare SHA-256.
- **`callerKeyOf(request)`** – Resolves the caller scope (account id or `ip:<addr>`) that forms the composite unique index alongside the raw key, preventing cross-caller replay.
- **`hasPrototypeKey(value)`** – Recursive guard that rejects any body containing its own `__proto__` key, working around a `canonicalize` bug that silently drops such keys from the fingerprint.
- **`armOutcomeCapture(response, key, caller)`** – Overrides `response.json` and `response.end` to write the handler's status, body, `Location`, `Content-Type`, and selected headers back to the ledger the moment the response is produced. A `recorded` latch prevents double-writes.
- **`reclaimAbandoned(raw, caller, existing, response, next)`** – Atomically (via a pinned `updatedAt` filter) takes over an `in_flight` record whose 5-minute lease has expired, allowing a retry to proceed; the loser of the race gets a 409.
- **`isAbandoned(record)`** – Returns true when an `in_flight` record is older than `IN_FLIGHT_LEASE_MS` (5 min).
- **`REPLAYED_HEADERS` / `replayedHeadersOf`** – Preserves `Retry-After`, `WWW-Authenticate`, and `Allow` on replayed responses so a cached refusal still carries its challenge/wait/method hints.
- **`KEY_PATTERN`** – `^[\w-]{1,200}$`; validates length and character class only (per the OpenAPI contract parameter), not UUID format specifically.

## Relationships

- **`idempotency-model.ts`** – Provides `idempotencyRecordModel` (the Mongoose model) and the `IdempotencyRecordDocument` type; this file is its sole writer.
- **`response.ts`** – Uses `rejectResponse` for 409 / 400 replies.
- **`mongo-errors.ts`** – Imports `isDuplicateKey` to detect the unique-index collision that signals a concurrent first attempt.
- **`pseudonymise.ts`** – Wraps the fingerprint so the stored digest is keyed and non-invertible.
- **`logger.ts`** – Emits warnings for unrecordable responses and failed `done`-state writes.
- **`i18n/`** – `t()` supplies localised error messages for rejection responses.
- **`time.ts`** – Provides `MINUTE_MS` for the in-flight lease constant.
- **Route files (`account`, `cart`, `delivery`, `example`, `inventory`)** – Consumers that mount this middleware on individual write endpoints.

## Notes

- **Mongo, not Redis.** The ledger deliberately avoids the Redis cache (`--maxmemory-policy allkeys-lru`) because an evicted record would silently permit a duplicate write under load.
- **Concrete path in the fingerprint.** `/order/A/refund` and `/order/B/refund` share an empty body; using the route template would replay A's answer for B.
- **Bodiless `end` handling.** A `202` via `acceptedResponse` never calls `json`; the `end` wrapper records it with `null` body. An `end` carrying raw bytes (after a `write`) is **not** recorded—the key stays `in_flight` until TTL rather than storing a truncated body.
- **Keyed hash, not bare hash.** `pseudonymise` ensures a Mongo dump does not yield a fast hash-guessing oracle for sensitive body fields (e.g. a plaintext password in `POST /signup`).
- **Per-route, not global.** GETs and already-idempotent-by-construction routes (provider callbacks, domain-keyed reservations) should not pay for the mechanism.
