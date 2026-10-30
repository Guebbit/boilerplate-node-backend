---
source: src/infrastructure/http/middlewares/idempotency.ts
sha256: 1bb3574d919f7815ae6d7a650b043e722f5ed9018ff74d59f874bca8c8835df2
generated_at: 2026-10-29T02:02:56.639358+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/idempotency.ts

## Purpose

Per-route Express middleware that makes retried `POST`/`PUT`/`PATCH` writes safe by storing a one-time `(key, caller)` record in Mongo. A caller supplies an `Idempotency-Key` header; if the same key+caller+request arrives again, the original response is replayed verbatim instead of re-running the handler. The header is fully optional — a request without one is treated exactly as if the middleware were not present.

## Key elements

- **`KEY_PATTERN`** — `/^[\w-]{1,200}$/`; validates the key's shape per the OpenAPI contract (length + character class only, not a UUID check).
- **`hasPrototypeKey(value)`** — recursively scans a request body for an own `__proto__` data property and refuses the request if found, working around a `canonicalize` (`@guebbit/js-toolkit`) bug that silently drops such keys from the fingerprint.
- **`fingerprintOf(request)`** — builds a stable identity string (`METHOD concretePath\n<canonicalized body>`) and runs it through `pseudonymise` to produce the stored fingerprint. Uses the concrete path, not the route template, so distinct resources with empty bodies don't collide.
- **`callerKeyOf(request)`** — resolves the caller scope: `request.caller.id` for authenticated users, `ip:<addr>` otherwise. Combined with the key it forms the unique index entry.
- **`IN_FLIGHT_LEASE_MS`** (5 min) / **`isAbandoned(record)`** — an in-flight record older than the lease is considered dead (process crash, killed worker).
- **`reclaimAbandoned(...)`** — atomically takes over an abandoned in-flight record via a CAS on `updatedAt`; exactly one racing retry wins, the rest get 409.
- **`armOutcomeCapture(response, key, caller)`** — monkey-patches `response.json` so the handler's final body, status, `Location`, `Content-Type`, and replayable headers are written back to the Mongo record the instant the response is sent (success *and* handled errors alike).
- **`respondToCollision(response, existing, fingerprint)`** — the E11000 handler: 409 if in-flight, 422 if fingerprint mismatches (key reuse for a different request), otherwise replays the stored response with the `Idempotent-Replay: true` header.
- **`REPLAYED_HEADERS`** — `Retry-After`, `WWW-Authenticate`, `Allow`; the only non-body headers copied onto a replayed response.
- **`StoredRecord`** — `Pick` of the model document fields the middleware actually reads/writes.

## Relationships

- **`idempotency-model.ts`** — supplies `idempotencyRecordModel` (Mongoose model) and the `IdempotencyRecordDocument` type; this file is the sole runtime consumer.
- **`response.ts`** — imports `rejectResponse` to emit the 409/422 problem+json errors.
- **`mongo-errors.ts`** — imports `isDuplicateKey` to detect the E11000 collision that routes into `respondToCollision`.
- **`pseudonymise.ts`** — imports `pseudonymise` so the stored fingerprint is a keyed hash, not a bare `sha256`, protecting plaintext bodies (e.g. passwords) in the Mongo ledger.
- **`logger.ts`** — imports `logger` for the warn-level log when the outcome-write-back fails after the response has already been sent.
- **`i18n/index.ts`** — imports `t` for localised error messages on the 409 and 422 responses.
- **`openapi.root.yaml`** — the `Idempotency-Key` header parameter (`/components/parameters/IdempotencyKeyHeader`) is the external contract that `KEY_PATTERN` mirrors.
- **Route files** (`account/routes.ts`, `cart/routes.ts`, `delivery/routes.ts`, `example/routes.ts`, `inventory/routes.ts`, `orders/routes.ts`) — each mounts this middleware on the specific write routes that need replay protection; it is never applied globally.

## Notes

- The record lives in **Mongo, not Redis**, deliberately: the production Redis runs `--maxmemory-policy allkeys-lru`, which can evict a live idempotency entry under memory pressure and turn it into a silent duplicate write.
- Mount per-route (like `uploadLimiter`), never globally. GET routes and already-idempotent-by-construction routes should not pay the lookup cost.
- `armOutcomeCapture` wraps `response.json` rather than hooking `response`'s `finish` event, because `json` already has the parsed body in hand (same pattern as `cache.ts`'s `armCacheWrite`).
- If the write-back to Mongo fails after the response is sent, the record stays `in-flight` and rides out its TTL; a subsequent retry sees 409 until then — no rollback is possible at that point.
- The `hasPrototypeKey` guard is a stopgap for an upstream `@guebbit/js-toolkit` bug (reported to the maintainers); it will be removable once `canonicalize` preserves own `__proto__` data keys correctly.
