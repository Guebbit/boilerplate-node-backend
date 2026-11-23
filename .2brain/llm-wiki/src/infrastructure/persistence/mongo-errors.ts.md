---
source: src/infrastructure/persistence/mongo-errors.ts
source_sha256: fc649ae0ad37e7faaf685d8b978820a4a5f947b19f22a987fc7775d5e313e920
context_sha256: f093df71e7c12a9d44882573e54e76fe04394e0386c35296c63023c3d29679a2
generated_at: 2026-11-22T03:03:21.775073+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/mongo-errors.ts

## Purpose
Centralizes driver-level checks on Mongo write/query failures, so repositories and the HTTP error interpreter can classify a caught error without duplicating the logic or treating a driver fact as an HTTP concern. Every check takes an `unknown` (a caught rejection can be any value) and returns a boolean.

## Key elements
- `isDuplicateKey(error)`: true when `error.code === 11000` (E11000, a unique index refused the write). It checks the code, not the message, because the message names the index and would break if the index is renamed.
- `isQueryTimeout(error)`: true when `error.code === 50` (`MaxTimeMSExpired`, a query killed at its `maxTimeMS`). It uses the private constant `MAX_TIME_MS_EXPIRED`.
- `isConnectionError(error)`: true when no database server was reachable. This means `name` is one of `MongoServerSelectionError`, `MongooseServerSelectionError`, `MongoNetworkError`, `MongoNotConnectedError` or `MongoNetworkTimeoutError`. It is also true for a bare `MongooseError` whose message contains `"buffering timed out"`. It returns `false` if `name` is not a string.
- `CONNECTION_ERROR_NAMES` and `BUFFERING_TIMEOUT_MESSAGE` (private): the lookup set and message string used by `isConnectionError`.

## Relationships
- `src/infrastructure/http/errors.ts`: its interpreters consume these predicates. `isDuplicateKey` maps to "already taken" (409). `isQueryTimeout` maps to 503 with its own `QUERY_TIMEOUT` code. `isConnectionError` maps to 503 in place of a generic 500 (see `databaseErrorInterpreter`).
- Repositories and services (for example, the `account`, `cart`, `payments` and `inventory` repositories) are listed as graph neighbors. The file's comments say repositories use `isDuplicateKey` as a retry signal on racing upserts. The source does not say which neighbor uses which predicate.

## Notes
- All checks match on error `code` or `name` rather than `instanceof`. `mongodb` is a transitive dependency of more than one package, so an `instanceof` against the wrong copy would silently miss.
- Mongoose's buffering-timeout error has no dedicated class. It is a plain `MongooseError`, the same base used for programmer errors, so the message substring is the only way to identify it.
- The numeric code `11_000` uses a numeric separator and equals 11000.
