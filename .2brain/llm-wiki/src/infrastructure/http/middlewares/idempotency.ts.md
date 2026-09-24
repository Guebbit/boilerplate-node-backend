---
source: src/infrastructure/http/middlewares/idempotency.ts
sha256: 6a801b5bdabf9f67e0aada6509bb0586197bde2186c3a625359effde5523ddaf
generated_at: 2026-09-23T17:43:49.123848+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/idempotency.ts

## Purpose

Per-route Express middleware that makes retried write requests safe by storing a one-time "claim" on the client-supplied `Idempotency-Key` header. On a replay it either re-sends the cached response (409 if still in-flight, 422 if the key was reused for a different request). Opt-in at the header level: requests without the key pass through untouched.

## Key elements

- **`idempotencyKey`** (exported `RequestHandler`) — entry point; reads the header, validates it against `KEY_PATTERN`, then delegates to `claimIdempotencyKey`.
- **`claimIdempotencyKey`** — atomically inserts an `in-flight` record via `idempotencyRecordModel.create`. On E11000 it reads the existing record and hands off to `respondToCollision`. Contains a single-retry path for the "record vanished (TTL reclaim)" race window.
- **`respondToCollision`** — branches on the stored record: `in-flight` → 409, fingerprint mismatch → 422, otherwise replays the stored status/body with `Idempotent-Replay: true`.
- **`armOutcomeCapture`** — monkey-patches `response.json` so that, once the guarded handler answers, the record is updated to `state: 'done'` with the status code and body. Failures to write the outcome are logged (the record simply rides out its TTL).
- **`fingerprintOf`** — SHA-256 of `METHOD baseUrl + routeTemplate` + canonicalized body. Uses `routeTemplateOf` so path parameters don't alter the hash.
- **`callerKeyOf`** — resolves the composite key's second axis: `request.caller.id` or `ip:<address>`.
- **`hasProtoKey`** — recursive scan for an own `__proto__` data property in the body; such bodies are rejected (422) because `canonicalize` from `@guebbit/js-toolkit` silently drops that key, producing identical fingerprints for different bodies.
- **`IDEMPOTENCY_KEY_HEADER`**, **`KEY_PATTERN`** — header name constant and validation regex (`/^[\\w-]{1,200}$/`).
- **`StoredRecord`** — type alias picking `state | fingerprint | status | body` from `IdempotencyRecordDocument`.

## Relationships

- **`idempotency-model.ts`** — provides `idempotencyRecordModel` (Mongoose model) and the `IdempotencyRecordDocument` type; the sole persistence layer for the ledger.
- **`request.ts`** — `routeTemplateOf` supplies the matched route pattern for fingerprinting.
- **`response.ts`** — `rejectResponse` is the uniform error-response helper used for 409/422/validation failures.
- **`mongo-errors.ts`** — `isDuplicateKey` detects the E11000 that signals a key collision.
- **`adapters/logger.ts`** — `logger.warn` for non-fatal outcome-capture failures.
- **`i18n/`** — `t` localizes user-facing error messages (`generic.error-idempotency-*`).
- **`shared/contracts/openapi.root.yaml`** — defines the `IdempotencyKeyHeader` parameter (length, character class) that `KEY_PATTERN` mirrors.
- **Route files** (`account/routes.ts`, `feedback/routes.ts`, `orders/routes.ts`, `payments/routes.ts`) — mount `idempotencyKey` on specific write endpoints (per-route, never globally).
- **`tests/unit/infrastructure/http/middlewares/idempotency.test.ts`** — unit tests covering the collision, replay, and race-retry paths.
- **`scripts/docs/generate-role-matrix.ts`** — consumes the contract to generate the per-route idempotency/role matrix documentation.

## Notes

- Storage is **Mongo with a TTL**, not Redis. The doc comment explicitly calls out that the Redis `allkeys-lru` policy in `docker-compose.yml` can evict a live record under load, silently permitting a duplicate write.
- The middleware is **opt-in**: absence of the header means no protection and no refusal. It is also **per-route** by design — GET routes and already-idempotent-by-construction routes should not pay for it.
- `armOutcomeCapture` wraps `response.json` (not the `finish` event) because `json` is the single point that already holds the parsed body; the same reasoning is cited from `cache.ts`.
- The "vanishing record" retry is bounded to **one** attempt (`retriesLeft`). A second vanish is treated as a genuine concurrent race and falls through to `next()` (uncaptured run) rather than looping.
- `__proto__` bodies are **hard-rejected** (422) until the upstream `canonicalize` bug is fixed; silently mis-fingerprinting is considered worse than refusing an illegitimate body.
- The fingerprint intentionally excludes the raw URL in favour of the route template so that two calls to `/orders/123` vs `/orders/456` with the same key and body are still the "same request."
