---
source: src/infrastructure/persistence/mongo-errors.ts
sha256: 461fd15c80fbfaf2b9d45e591dd57595b45e656dec1a17e4a7078a08f7433368
generated_at: 2026-09-23T17:50:31.023815+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/mongo-errors.ts

## Purpose

Provides two small predicate helpers that let callers determine _what kind_ of Mongo driver error they caught, without reaching into the response/HTTP layer. It exists so that repositories and the HTTP error interpreter can share a single, correct definition of "duplicate key" and "bad ObjectId" instead of each re-deriving the check inline.

## Key elements

- **`isDuplicateKey(error: unknown): boolean`** — Returns `true` when the caught value carries `code === 11000` (Mongo's E11000 duplicate-key). Checks the numeric code rather than the error message, so it survives index renames.
- **`isBadObjectId(error: unknown): boolean`** — Returns `true` when the caught value is a `mongoose.Error.CastError` whose `kind` is `'ObjectId'`. Distinguishes a malformed ID from a well-formed-but-absent one (both should surface as 404, but the distinction matters for logging/alerting).

## Relationships

- **`src/infrastructure/http/errors.ts`** — The HTTP error interpreter consumes `isDuplicateKey` to map E11000 to a 409 "already taken" response.
- **`src/modules/cart/repository.ts`**, **`src/modules/inventory/repository.ts`**, **`src/modules/payments/repository.ts`** — Each repository calls `isDuplicateKey` (as a retry signal on racing upserts) and `isBadObjectId` (to normalise a malformed-ID `CastError` into the same 404 path as a genuine miss).
- **`src/infrastructure/http/controller.ts`** — Indirectly benefits: controllers throw/receive the errors these predicates classify, letting the error interpreter produce the correct status code.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — May rely on `isDuplicateKey` to detect that a write already completed (idempotent replay).
- **`tests/unit/infrastructure/persistence/mongo-errors.test.ts`** — Unit-tests both predicates, including the "not a CastError" and "wrong code" negative cases.

## Notes

- Both helpers accept `unknown` (not `Error`) because a `.catch()` callback's argument is typed `unknown` in TS; the narrowing is the whole point.
- `isDuplicateKey` deliberately checks `code`, not `message`, to avoid coupling to the human-readable index name that Mongo embeds in the E11000 text.
- The module doc-comment explicitly notes that the list of callers is intentionally _not_ maintained here to avoid staleness.
