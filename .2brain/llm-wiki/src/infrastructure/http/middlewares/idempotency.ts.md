---
source: src/infrastructure/http/middlewares/idempotency.ts
sha256: 00b884d2bbb3024408ca40567d43aafa05f3d463c807ea0a807ed41c3069ca3f
generated_at: 2026-09-27T14:09:37.154306+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/idempotency.ts

## Purpose

Express middleware that makes retried write requests safe by replaying a previously captured response instead of re-running the handler. It is mounted per-route (never globally) and is fully opt-in: a request without an `Idempotency-Key` header passes through untouched. Records are stored in Mongo (not Redis) because the production cache runs `allkeys-lru` eviction, which would silently turn a replay into a duplicate write under load.

## Key elements

- **`KEY_PATTERN`** — Regex (`^[\w-]{1,200}$`) validating the key per the OpenAPI contract; does *not* enforce UUID format.
- **`hasProtoKey(value)`** — Recursive check for an own `__proto__` key anywhere in the body. Bodies that carry one are rejected (422) because `canonicalize` (js-toolkit 2.2.0) silently drops them, producing identical fingerprints for different bodies.
- **`fingerprintOf(request)`** — SHA-256 of `method + baseUrl + concrete path + canonicalized body`. Uses the concrete path (not the route template) so `/order/A/refund` and `/order/B/refund` don't collide.
- **`callerKeyOf(request)`** — Resolves the caller scope: authenticated account id, or `ip:<address>` for public routes. Prevents cross-caller replay via key guessing.
- **`IN_FLIGHT_LEASE_MS`** (5 min) / **`isAbandoned(existing)`** — An in-flight record older than this is considered dead (crashed process) and eligible for re-claim.
- **`reclaimAbandoned(...)`** — Atomic `updateOne` pinned on the observed `updatedAt`; exactly one of N racing retries wins and runs the handler, the rest get 409.
- **`armOutcomeCapture(response, key, caller)`** — Monkey-patches `response.json` so the handler's final body (success *or* handled error) is written back to Mongo as `state: 'done'`. Falls back to "let the record expire in-flight" if the write-back fails.
- **`respondToCollision(response, existing, fingerprint)`** — Three outcomes for a duplicate key: 409 (in-flight), 422 (fingerprint mismatch → key reused for a different request), or verbatim replay with `Idempotent-Replay: true` header.
- **`onDuplicateKey(...)`** — Handles E11000: reads the existing record, delegates to `respondToCollision` or `reclaimAbandoned`. If the record vanished (TTL race), retries the create once (`retriesLeft` guard) to avoid running the handler uncaptured.
- **`claimIdempotencyKey(...)`** (truncated in listing) — Top-level claim: inserts a new `in-flight` record, then calls `armOutcomeCapture` + `next()` on success, or routes to `onDuplicateKey` on E11000.

## Relationships

- **`idempotency-model.ts`** — Provides `idempotencyRecordModel` (Mongoose model) and the `IdempotencyRecordDocument` type; owns the collection schema and TTL index.
- **`response.ts`** — Supplies `rejectResponse` used for all 409/422 error shapes.
- **`mongo-errors.ts`** — `isDuplicateKey` detects E11000 to enter the collision branch.
- **`@infrastructure/i18n` (`t`)** — Translated error messages for `IDEMPOTENCY_IN_FLIGHT` and `IDEMPOTENCY_KEY_MISMATCH`.
- **`@infrastructure/adapters/logger`** — `logger.warn` for non-fatal write-back failures.
- **`shared/contracts/openapi.root.yaml`** — Defines the `IdempotencyKeyHeader` parameter (length 1–200, `\w-` charset) that `KEY_PATTERN` mirrors.
- **Route files (`orders`, `payments`, `cart`, `feedback`, `account`)** — Mount this middleware per individual write route; they never apply it globally.
- **`tests/unit/.../idempotency.test.ts`** — Unit tests covering fingerprint, collision, reclaim, and proto-key rejection paths.

## Notes

- **Concrete path, not template.** The fingerprint uses `request.path` (already substituted by Express), not `request.route.path`. Using the template would make `/order/A/refund` and `/order/B/refund` share a fingerprint and replay the wrong response.
- **`__proto__` rejection is a workaround, not a validation choice.** Legitimate clients never send `__proto__` as a JSON body key; the rejection exists solely because the upstream `canonicalize` library silently drops it, producing a false "same body" fingerprint. Remove once the upstream fix ships.
- **Write-back is fire-and-forget.** If Mongo is unavailable when the handler finishes, the record stays `in-flight` and expires on its TTL. The client sees the correct response either way; the cost is a 409 on retry until the TTL lapses.
- **One retry on vanished record.** `onDuplicateKey` allows at most one re-create attempt (`retriesLeft` decrements to 0). A second pass means a genuine race and falls through to the ordinary collision path.
- **Not a UUID check.** Despite the header name implying UUID, the contract only constrains length and character class. A caller can use any `\w-` string up to 200 chars.
