# src/infrastructure/http/errors.ts

## Purpose

Defines the HTTP-layer error types and the single mapping point for database-driver failures to HTTP responses. It lets controllers `throw` a structured error (or delegate to a helper) instead of hand-rolling status codes, and guarantees that all twelve Mongoose models interpret a duplicate key, a bad ObjectId, or a validator rejection identically.

## Key elements

- **`ExtendedError`** (class, extends `Error`) — Carries `httpCode`, `isOperational`, and user-facing `errors[]`. Non-operational (unexpected) errors are logged in the constructor via `logger.error`, so a record exists even if a caller swallows the throw. Uses `Object.setPrototypeOf` to preserve `instanceof` across subclasses under ES5 transpilation.
- **`isDuplicateKey`** (function) — Type-guards for Mongo E11000 by checking `code === 11_000`. Exported separately so the cart repository can use it as a retry signal while the interpreter maps it to 409.
- **`databaseErrorInterpreter`** (function) — Pure mapping from a `CastError | Error` to a `[httpCode, message]` tuple. Branches: `CastError` (422), duplicate key (409), `BSONError` (422), `ValidationError` (422), fallback (500). Detects BSON/Validation errors by `name` string, not `instanceof`, to avoid transitive-dependency copy mismatches.
- **`rejectDatabaseError`** (function) — Entry point for controller `.catch` blocks. Calls the interpreter, logs with a developer-facing `context` string, and sends the response via `rejectResponse`.
- **`rejectDatabaseEnvelope`** (function) — Same logic as above but returns a `generateReject(status)` envelope instead of writing to an Express `Response`, for services that have no `res` object.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports `logger`; used by `ExtendedError`'s constructor and by both `reject*` helpers to write server-side log lines.
- **`src/infrastructure/http/response.ts`** — Imports `generateReject` and `rejectResponse`; the two `reject*` helpers delegate actual response construction to these.
- **`src/app/error-handling.ts`** — The central Express error middleware that catches thrown `ExtendedError` instances and serialises them into an HTTP response using the `httpCode`/`errors` fields.
- **`src/modules/cart/repository.ts`** — Consumes `isDuplicateKey` as a retry signal (distinct from the interpreter's 409 mapping).
- **Controllers & services** (e.g. `post-login.ts`, `get-refresh-token.ts`, `create-item-controller.ts`, `authentication.ts`, `profile.ts`) — Call `rejectDatabaseError` or `rejectDatabaseEnvelope` in their `.catch` paths, or throw `ExtendedError` for expected business failures.

## Notes

- `isOperational` defaults to **false**, so a bare `throw new ExtendedError('X', 500)` is treated as a bug and logged immediately. Pass `true` explicitly for expected outcomes (wrong password, validation).
- The interpreter checks `name` strings (`'BSONError'`, `'ValidationError'`) rather than `instanceof` because `bson` and Mongoose internals can resolve to different copies in `node_modules`; `instanceof` across copies silently fails.
- `databaseErrorInterpreter` is intentionally a closed list of branches. The doc comment states a new driver-error case should add a branch *here*, not in individual controllers.
- The `errors[]` array on `ExtendedError` is the only user-facing content safe to return to clients; the raw driver `message` and `stack` are logged but never sent in the response body.
