---
source: src/infrastructure/http/middlewares/idempotency.ts
sha256: 2d51c050a2ecfb8d429b116025e389ae290c7eac45c0ac8af34bb963ef2635ed
generated_at: 2026-10-14T07:56:41.936564+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/idempotency.ts

## Purpose

Express middleware that makes retried write requests safe by replaying a previously stored response instead of re-executing the handler. It is mounted per-route (not globally) and is opt-in via the `Idempotency-Key` request header: a client that omits the header gets neither protection nor refusal. The ledger lives in Mongo (TTL-expired) rather than Redis, because the cache's `allkeys-lru` eviction policy could silently discard a live record under load and turn a retry into a duplicate write.

## Key elements

- **`fingerprintOf(request)`** – Builds a stable, order-independent fingerprint of `method + concrete path + canonicalized body` (via `@guebbit/js-toolkit`'s `canonicalize`), then passes it through `pseudonymise` as a keyed hash so plaintext secrets (e.g. a password in a signup body) are not stored in reversible form.
- **`callerKeyOf(request)`** – Resolves the caller identity (authenticated account id or IP) used as the second component of the `(key, caller)` composite that the unique index enforces, preventing cross-user key guessing.
- **`hasPrototypeKey(value)`** – Recursively scans `request.body` for an own `__proto__` property. If found, the request is refused because `canonicalize` silently drops such keys (setter invocation), which would cause two different bodies to hash identically.
- **`armOutcomeCapture(response, key, caller)`** – Wraps `response.json` so that whichever outcome the guarded handler produces is written back to the Mongo record as `state: 'done'` with status, body, and optional `location`.
- **`respondToCollision(response, existing, fingerprint)`** – Branches on the three collision states: in-flight → 409, fingerprint mismatch → 422, same request → replay the stored response with `Idempotent-Replay: true`.
- **`reclaimAbandoned(raw, caller, existing, response, next)`** – Atomically takes over an in-flight record that outlived the 5-minute lease (`IN_FLIGHT_LEASE_MS`) using a pinned `updatedAt` filter, so only one of racing retries wins.
- **`onDuplicateKey(...)`** – Handles the E11000 path: reads the existing record, delegates to `respondToCollision`, or retries the create once if the record vanished under TTL between the failed insert and the read.
- **`IDEMPOTENCY_KEY_HEADER` / `KEY_PATTERN`** – Header name (lower-cased per Express) and the validation regex (`^[\w-]{1,200}$`), matching the OpenAPI contract parameter rather than enforcing UUID format.

## Relationships

- **`src/infrastructure/http/middlewares/idempotency-model.ts`** – Supplies `idempotencyRecordModel` (Mongoose model) and the `IdempotencyRecordDocument` type; this file is the sole consumer of that model.
- **`src/infrastructure/http/response.ts`** – Provides `rejectResponse`, used for all error/409/422 replies.
- **`src/infrastructure/persistence/mongo-errors.ts`** – Provides `isDuplicateKey` to detect the E11000 branch.
- **`src/infrastructure/security/pseudonymise.ts`** – Provides the keyed-hash function used by `fingerprintOf` to avoid storing a bare SHA-256 of the body.
- **`src/infrastructure/adapters/logger.ts`** – Provides `logger.warn` for the non-fatal path where the outcome capture write fails after the response has already been sent.
- **`src/infrastructure/i18n/index.ts`** – Provides the `t` function for user-facing error messages.
- **`shared/contracts/openapi.root.yaml`** – Defines `#/components/parameters/IdempotencyKeyHeader`; the `KEY_PATTERN` regex in this file mirrors that contract.
- **Route modules (`account`, `cart`, `feedback`, `inventory`, `orders`, `payments` `/routes.ts`)** – Mount this middleware on their write endpoints (the file explicitly warns against global mounting and against applying it to routes already idempotent by domain design).

## Notes

- The fingerprint uses the **concrete path** (`request.baseUrl + request.path`), not the route template. Using the template would cause `/order/A/refund` and `/order/B/refund` (both empty-body POSTs) to collide and replay the wrong response.
- `armOutcomeCapture` hooks `response.json` rather than the `finish` event, for the same reason as `cache.ts`'s `armCacheWrite`: `json` already holds the parsed body.
- If the outcome-capture `updateOne` fails after the response is sent, the record stays `in-flight` until its Mongo TTL expires; a retry in that window gets 409. This is an accepted trade-off (documented inline) rather than a bug.
- The `__proto__` guard (`hasPrototypeKey`) is a known upstream limitation in `@guebbit/js-toolkit` 2.2.0; until fixed, any body containing an own `__proto__` key is refused outright.
- `IN_FLIGHT_LEASE_MS` is 5 minutes—deliberately far above any real handler timeout—so a "stale" in-flight record is assumed to be a dead process, not a slow one.
