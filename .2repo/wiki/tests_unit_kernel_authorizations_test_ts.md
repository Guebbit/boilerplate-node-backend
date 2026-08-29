# tests/unit/kernel/authorizations.test.ts

## Purpose

Unit tests for the three authorization middlewares (`getAuth`, `isAuth`, `isAdmin`) and the `getTokenBearer` helper in `src/kernel/middlewares/authorizations.ts`. The file exists to pin the deliberately different failure modes of each middleware (fail-open vs. fail-closed vs. role-gated), the exact status codes a client receives, and the audit events emitted on rejection. The response layer is exercised for real; only the JWT/DB boundary and the audit sink are stubbed.

## Key elements

- **`getTokenBearer` tests** — strips the `Bearer` prefix; returns `undefined` for absent or token-less headers.
- **`getAuth` tests** — optional identification that always calls `next()` exactly once. Covers: no token, valid token, missing `admin` flag (normalised to `false`), invalid/expired token, deleted user, DB failure, and the invariant that it never sends its own response.
- **`isAuth` tests** — required identification; rejects with 401 when the auth context or bearer token is missing. Asserts a `SECURITY_UNAUTHORIZED` audit event on rejection and no event on pass-through.
- **`isAdmin` tests** — required elevation; passes admin, rejects non-admin with 403, rejects absent `admin` flag, and (per the truncated tail) distinguishes 401 (no credentials) from 403 (known non-admin).
- **`makeRequest` / `makeCookieRequest`** — local helpers that build `Request` stubs via `asStub`, carrying optional `Authorization` header, `authContext`, or `cookies.jwt`.
- **`runUntilNext`** — helper that invokes an async middleware and resolves once `next()` is called, returning the `next` mock for assertions.
- **Mocked auth resolver** — `registerAuthResolver` is called once with `fromAccessToken` / `fromRefreshToken` jest mocks; the two resolve/reject paths (bad token vs. valid token naming nobody) are kept distinguishable to match production semantics.
- **`emitAuditEvent` mock** — `jest.mock` replaces only the sink; `buildAuditEvent` and the `coreAuditActions` vocabulary remain real so shape mismatches surface in tests.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — the module under test; all five exported symbols are imported here.
- **`src/kernel/authentication.ts`** — `registerAuthResolver` is called to inject the fake resolvers, replacing the production implementation for the duration of the test.
- **`src/infrastructure/observability/audit.ts`** — `emitAuditEvent` is mocked (spied via `jest.requireActual`); `coreAuditActions` is consumed as the real vocabulary in audit-event assertions.
- **`tests/support/stub.ts`** — `asStub` is used to build the `Request`, `NextFunction`, and other plain-object stubs throughout the file.
- **`tests/support/express.ts`** — `makeResponseStub` provides the chainable `status().json()` response stub whose calls are asserted.

## Notes

- The `getAuth` "never sends a response" test guards against a future refactor that would let the optional middleware pre-empt the route handler with a status code.
- The `admin ?? false` normalisation test exists because both `isAdmin` and `orderService.callerScope` branch on the flag; an explicit `false` is the only value that cannot be misread as "unknown."
- `isAuth` requires **both** a populated `authContext` **and** a present bearer token; the test with context-but-no-token documents that an already-populated request object cannot stand in for a credential.
- The file references `isAdminViaCookie` in the import list but the truncated content does not show its test block; expect cookie-path coverage below the truncation point.
