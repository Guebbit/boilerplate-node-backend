---
source: src/infrastructure/persistence/mongo-errors.ts
sha256: f35afd5fb58aca904caeb95318eb67cb2a6ee390080d932f05dffa0ed34026bc
generated_at: 2026-11-08T03:43:40.794181+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/mongo-errors.ts

## Purpose

Provides two driver-level predicates—`isDuplicateKey` and `isConnectionError`—so that repositories and the HTTP error interpreter can classify Mongo write failures (duplicate key vs. server unreachable) without reaching into the response layer or depending on mutable error message text.

## Key elements

- **`isDuplicateKey(error: unknown): boolean`** — Returns `true` when the error carries `code === 11_000` (Mongo E11000). Checks the numeric code, not the message, because the message embeds the index name and would break on rename.
- **`isConnectionError(error: unknown): boolean`** — Returns `true` when the error's `.name` is one of the known connection-failure names *or* when it is a `MongooseError` whose message contains `"buffering timed out"`. Distinguishes "server unreachable" (→ 503) from "server understood and refused" (→ 500).
- **`CONNECTION_ERROR_NAMES`** (module-private `Set`) — The five driver/Mongoose error names treated as connection failures: `MongoServerSelectionError`, `MongooseServerSelectionError`, `MongoNetworkError`, `MongoNotConnectedError`, `MongoNetworkTimeoutError`.
- **`BUFFERING_TIMEOUT_MESSAGE`** (module-private) — The literal Mongoose buffering-timeout string, used because Mongoose does not emit a dedicated class for that condition.

## Relationships

- **`src/infrastructure/http/errors.ts`** — Consumes both exports: maps `isDuplicateKey` → 409 Conflict and `isConnectionError` → 503 (RFC 9110 §15.6.4).
- **Repository modules** (`account`, `addresses`, `cart`, `inventory`, `notifications`, `payments`) — Use `isDuplicateKey` as a retry/idempotency signal when a racing upsert hits a unique index.
- **`src/infrastructure/persistence/lease.ts`** — Same persistence layer; likely benefits from the same driver-level classification.
- **`tests/unit/infrastructure/persistence/mongo-errors.test.ts`** — Unit tests for both predicates.

## Notes

- All checks use `.name` / `.code` property access on `unknown`, **never** `instanceof`. Rationale (stated in-file): `mongodb` appears as a transitive dependency in more than one package, so an `instanceof` against the wrong copy silently fails.
- `isConnectionError` destructures with a nullish guard (`error ?? {}`) and type-narrows `name`/`message` to strings before use, so it safely handles non-object rejections (e.g. a thrown primitive).
- The Mongoose buffering-timeout case is the *only* place a message string is matched, because Mongoose reuses its generic `MongooseError` class for that condition.
- The file deliberately does **not** enumerate its callers in docs (the doc-comment notes the list "only goes stale").
