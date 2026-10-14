---
source: src/infrastructure/persistence/mongo-errors.ts
sha256: f35afd5fb58aca904caeb95318eb67cb2a6ee390080d932f05dffa0ed34026bc
generated_at: 2026-10-14T08:10:19.163574+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/mongo-errors.ts

## Purpose

Provides two narrow type-guard functions that classify Mongo/Mongoose write failures as either **duplicate-key** (unique-index violation) or **connection-unreachable**. They exist so that repositories and the HTTP error interpreter can inspect driver-level facts about a caught rejection without coupling to the response layer or to a specific driver package instance.

## Key elements

- **`isDuplicateKey(error: unknown): boolean`** — Returns `true` when the error object carries `code === 11000` (E11000). Checks the numeric code, never the human-readable message, so a renamed unique index does not break detection.
- **`isConnectionError(error: unknown): boolean`** — Returns `true` when the error's `.name` is one of the known "no server reachable" names *or* when it is a `MongooseError` whose message contains `"buffering timed out"`. Distinguishes unreachability (→ 503) from a server-accepted-but-refused request (→ 500).
- **`CONNECTION_ERROR_NAMES`** *(module-private)* — `Set<string>` of the five driver/Mongoose error names that signal unreachability (`MongoServerSelectionError`, `MongooseServerSelectionError`, `MongoNetworkError`, `MongoNotConnectedError`, `MongoNetworkTimeoutError`).
- **`BUFFERING_TIMEOUT_MESSAGE`** *(module-private)* — The fixed string Mongoose embeds in its generic `MongooseError` for buffering timeouts; used as the sole discriminator since Mongoose ships no dedicated class for that case.

## Relationships

- **`src/infrastructure/http/errors.ts`** — The HTTP error interpreter calls `isDuplicateKey` (maps to **409**) and `isConnectionError` (maps to **503**) to choose the response status code.
- **`src/infrastructure/persistence/lease.ts`**, **`src/modules/account/repository.ts`**, **`src/modules/addresses/repository.ts`**, **`src/modules/cart/repository.ts`**, **`src/modules/inventory/repository.ts`**, **`src/modules/payments/repository.ts`** — Repository implementations catch write rejections and use `isDuplicateKey` (e.g., as a retry signal on racing upserts) or `isConnectionError` (to surface a distinct failure mode to callers).
- **`src/modules/account/services/export.ts`**, **`src/modules/invoicing/services/issue-credit-note.ts`**, **`src/modules/invoicing/services/issue-invoice.ts`**, **`src/modules/webhooks/services/publish.ts`** — Service-layer code that catches Mongo write errors and delegates classification to these guards.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — Uses `isDuplicateKey` to recognize that a duplicate-key rejection is an expected idempotency outcome rather than a real error.
- **`tests/unit/infrastructure/persistence/mongo-errors.test.ts`** — Unit tests covering both guards.

## Notes

- All guards check **`error.name` / `error.code` as plain property access**, never `instanceof`. This is deliberate: `mongodb` / `mongoose` can appear as a transitive dependency of more than one package, so `instanceof` against the wrong copy would silently miss the error.
- The Mongoose buffering-timeout case is the one place a **message substring** is used (`message.includes(...)`), because Mongoose reuses its generic `MongooseError` class with no dedicated subclass for that condition.
- Both guards accept `unknown`, not a typed driver error, so they are safe to call on any caught rejection (including `null`, `undefined`, or non-error values) without narrowing first.
