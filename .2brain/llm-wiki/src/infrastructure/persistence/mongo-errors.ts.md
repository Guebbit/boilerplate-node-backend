---
source: src/infrastructure/persistence/mongo-errors.ts
sha256: 90ac3d624253e330aa7d561e22e4bee8f19c9fd7903b33d58ece05bf44050162
generated_at: 2026-09-27T14:14:23.599304+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/mongo-errors.ts

## Purpose

Driver-level error classifiers for Mongo/Mongoose write and read failures. It centralises "what *kind* of driver error is this?" so that repositories and the HTTP error interpreter can branch on a driver fact without reaching into the response layer for something that belongs to the driver.

## Key elements

- **`isDuplicateKey(error)`** — Returns `true` when `error.code === 11_000` (E11000), i.e. a unique-index rejection. Used by repositories as a "racing upsert, retry" signal and by `http/errors.ts` to emit 409.
- **`isBadObjectId(error)`** — Returns `true` when the caught rejection is a `mongoose.Error.CastError` with `kind === 'ObjectId'`. Lets `findById`-style catches distinguish a malformed id from a well-formed-but-missing one (both should yield 404).
- **`isConnectionError(error)`** — Returns `true` when the failure indicates the database was unreachable (server-selection, network, not-connected, network-timeout, or Mongoose buffering timeout). The HTTP layer maps this to 503 rather than the generic 500.
- **`CONNECTION_ERROR_NAMES`** *(internal)* — `Set` of the five error `.name` strings checked by `isConnectionError`.
- **`BUFFERING_TIMEOUT_MESSAGE`** *(internal)* — The literal `"buffering timed out"` string Mongoose embeds in its bare `MongooseError` for buffering-timeout failures.

## Relationships

- **`src/infrastructure/http/errors.ts`** — Consumes `isDuplicateKey` (→ 409) and `isConnectionError` (→ 503) inside its `databaseErrorInterpreter`.
- **`src/modules/cart/repository.ts`, `src/modules/inventory/repository.ts`, `src/modules/payments/repository.ts`** — Call `isDuplicateKey` to detect racing upserts and `isBadObjectId` in `findById` catch blocks.
- **`tests/unit/infrastructure/persistence/mongo-errors.test.ts`** — Unit-tests all three exported predicates.

## Notes

- **Code, not message, for E11000.** `isDuplicateKey` checks `error.code === 11000`; it deliberately avoids matching the human-readable text because the message names the index and would break on rename.
- **`name` string, not `instanceof`, for connection errors.** `mongodb` is a transitive dependency of more than one package; an `instanceof` against the wrong copy silently misses. The same convention is used by `isPermanentConnectError` in `runtime/database.ts`.
- **Buffering timeout has no dedicated class.** Mongoose throws the generic `MongooseError` with the fixed message `"buffering timed out"`, so `isConnectionError` falls back to a `message.includes` check — the only distinguishable signal.
- **All predicates accept `unknown`.** A `.catch()` callback's argument is never provably a specific error type, so each helper destructures defensively (`(error ?? {}) as {…}`) before inspecting `name`/`code`/`message`.
