# src/infrastructure/http/errors.ts

## Purpose
Defines the HTTP-layer error vocabulary: a custom `ExtendedError` class for throwing typed, status-carrying errors from any layer, and a set of helpers that translate raw Mongoose/driver failures into the correct HTTP status and a safe client message. It exists so that status codes are derived in one place, driver messages never leak to clients, and operational vs. programmer errors are handled (logged or not) consistently.

## Key elements
- **`ExtendedError`** — `Error` subclass carrying `httpCode`, `isOperational`, and a user-facing `errors: string[]`. Non-operational instances are logged in the constructor (under the `error` key, so `serializeError` in the logger can strip the stack). `Object.setPrototypeOf(this, new.target.prototype)` restores `instanceof` for ES5 targets.
- **`isDuplicateKey(error)`** — Type guard for Mongo E11000, checked by `.code === 11000` (never by message).
- **`databaseErrorInterpreter(error)`** — Maps a Mongoose/driver error to a `[httpCode, message]` tuple. Branches: `CastError` (422), duplicate key (409), `BSONError` by name (422), `ValidationError` by name (422), fallback (500). Uses `name`-based checks rather than `instanceof` to avoid dual-copy `bson` issues.
- **`rejectDatabaseError(response, context, error)`** — Controller-side: logs with operation context, then calls `rejectResponse` from `./response`.
- **`rejectDatabaseEnvelope(context, error)`** — Service-side: logs the same way but returns a `generateReject(status)` envelope instead of writing to an Express `Response`.

## Relationships
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger`; every non-operational `ExtendedError` and both `reject*` helpers emit `logger.error` calls.
- **`src/infrastructure/http/response.ts`** — Imports `rejectResponse` and `generateReject` to build the actual HTTP/envelope payload.
- **`src/app/error-handling.ts`** — The central Express error middleware that catches thrown `ExtendedError` instances and derives the response from `httpCode` / `errors`.
- **`src/infrastructure/http/controller.ts` / `delete-controller.ts`** — Call `rejectDatabaseError` in `.catch` handlers and `throw new ExtendedError(…)` for validation failures.
- **`src/modules/account/services/authentication.ts` / `profile.ts`** — Call `rejectDatabaseEnvelope` because services lack an Express `Response`.
- **`src/modules/cart/controllers/post-checkout.ts`** — Uses `isDuplicateKey` to distinguish a retryable race from a plain 409.
- **`docs/theory/request-flow.md`** — Referenced in the `databaseErrorInterpreter` docstring as the canonical explanation of where each status originates.

## Notes
- `isOperational` defaults to **`false`**, meaning an unannotated `ExtendedError` is treated as a programmer error and logged immediately. Set it to `true` for expected failures (404, wrong password, etc.) to suppress that log.
- `databaseErrorInterpreter` identifies `BSONError` and `ValidationError` by the `.name` string, **not** `instanceof`, because `bson` can appear as a transitive dependency of two different packages and a cross-copy `instanceof` check silently returns `false`.
- The interpreter checks `CastError` via `hasOwnProperty('kind')` (using `Object.prototype.hasOwnProperty.call`) to stay safe on null-prototype objects.
- `ExtendedError` composes `name` and `errors` into the base `Error.message` so a bare log of `.message` is still human-readable.
