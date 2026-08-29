# tests/unit/infrastructure/http/errors.test.ts

## Purpose

Unit tests for `src/infrastructure/http/errors.ts`, covering the `ExtendedError` class (construction, message composition, `instanceof` semantics, default operational flag, and the logging-on-construction contract) and the `databaseErrorInterpreter` / `isDuplicateKey` pipeline (mapping driver and Mongoose errors to `[httpCode, message]` tuples). The tests pin behavior that guards against two failure modes: a client error (4xx) being reported as a server error (500), and a server bug being swallowed as a routine operational failure.

## Key elements

- **`describe('ExtendedError')`** — verifies exposed fields (`name`, `httpCode`, `isOperational`, `errors`), `message` composition format, `instanceof` after down-level compilation (via `new.target.prototype`), subclass compatibility, the default-`false` operational flag, and that `logger.error` is called exactly once for non-operational errors but never for operational ones.
- **`describe('databaseErrorInterpreter')`** — covers the catch-all 500 path, the empty-message → `'Unknown error'` fallback (intentional `||` over `??`), CastError discrimination (own `kind` property, not inherited), and the CastError → 422 branch (no NaN status, no schema-type-name leak, no status parsed from message prose).
- **`describe('isDuplicateKey')`** — asserts recognition by numeric `code === 11000` only; rejects message-text matching, near-miss codes, and `undefined`.
- **`describe('duplicate-key branch')`** — pins the `[409, 'Already exists']` tuple and asserts the driver message (which contains the duplicated value) is never echoed.
- **`describe('BSONError branch')`** — pins 422 for `BSONError` (identified by `name`), reachable without auth on public endpoints.
- **Helper factories** — `makeCastError`, `makeDuplicateKeyError`, `makeValidationError`, `makeBsonError` build minimal shape-compatible objects via `asStub`.
- **`jest.mock('@infrastructure/adapters/logger')`** — replaces the real logger with a `jest.fn()`-backed object so construction-time logging can be asserted in isolation.

## Relationships

- **`src/infrastructure/http/errors.ts`** — the module under test; all imports (`ExtendedError`, `databaseErrorInterpreter`, `isDuplicateKey`, `rejectDatabaseEnvelope`, `rejectDatabaseError`) come from here.
- **`src/infrastructure/adapters/logger.ts`** — mocked at the module boundary; the tests assert which methods (`error`) are called and with what shape, but never exercise the real logger.
- **`tests/support/express.ts`** — provides `makeResponseStub`, a chainable `status().json()` stub used when exercising `rejectDatabaseError` / `rejectDatabaseEnvelope` against an Express response.
- **`tests/support/stub.ts`** — provides `asStub<T>`, a typed cast used to build CastError, BSONError, and other Mongoose/driver-shaped objects without importing the real driver.

## Notes

- The CastError branch discriminates on `Object.prototype.hasOwnProperty.call(err, 'kind')`, not a plain property read. An object that merely *inherits* `kind` must fall through to the 500 path — there is a dedicated test for this.
- `databaseErrorInterpreter` uses `||` (not `??`) on the message field so that an empty string is replaced with `'Unknown error'`; this is intentional and commented as such.
- The duplicate-key test asserts the response message does **not** contain `'users_email'` or `'E11000'` — a regression guard against leaking the duplicated value (an email address) into the client response.
- `ExtendedError` logs the Error object under the `error` key (not as top-level `stack`/`name` fields) so that `redactFormat`/`serializeError` in the logger pipeline can decide whether to strip stack traces in production. The test asserts the exact key shape to keep that contract visible.
- The file header comment documents three production incidents that motivated specific branches (malformed id on a public endpoint, wrong status code, driver prose in the body). The tests are written to pin those exact regressions.
