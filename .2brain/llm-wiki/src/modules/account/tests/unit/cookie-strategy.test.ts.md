---
source: src/modules/account/tests/unit/cookie-strategy.test.ts
sha256: e97e3130d71e1faef55e3268ab38381ccef3e3e00d9ad1275893974c0f42e4b3
generated_at: 2026-10-15T10:14:13.078332+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/cookie-strategy.test.ts

## Purpose

Unit-level tests for the `cookie` session-mode adapter (`cookie-strategy.ts`). Verifies three surfaces — credential extraction from a request, resolution of a presented session id, and issuance of a new session — with the session store, user service, and proof resolver all replaced by mocks. End-to-end behavior against a real store is covered separately in `../integration/session-modes.test.ts`.

## Key elements

- **`credentialOf` suite** — asserts the strategy picks the `ses_` bearer token, reads the scheme case-insensitively, falls back to the `Cookie` header when the bearer is a JWT, and returns `undefined` when neither is present.
- **`resolveBearer` / `resolveCookie` suite (parameterized via `describe.each`)** — covers malformed ids, JWT-shaped credentials (treated as revoked), lookup-by-hash (never by raw id), cross-mode rows, expired rows, proof delegation to `resolveProof`, missing-proof fallback (`authTime: 0`, `amr: []`), inactive-account short-circuit, the 60-second `touch` throttle, and resilience to `touch` failure.
- **`issue` suite** — validates user-not-found, two-factor enforcement (`SecondFactorRequiredError`), stale-proof rejection (`StaleProofError`), `authTime` truncation to seconds, and the stored row shape.
- **`liveRow(overrides?)`** — factory that builds a well-formed `NewSessionRow` fixture with a live 1-hour expiry and `amr: ['pwd']`.
- **`insertedRow()`** — pulls the last argument passed to `sessions.insert` for assertions.
- **`beforeEach`** — resets all mocks, sets `rolesOf` to resolve a customer, configures `NODE_SESSION_TIME_SHORT` / `NODE_SESSION_TIME_LONG`, and gives default resolutions to repository and user-service doubles.

## Relationships

| Neighbor | Interaction |
|---|---|
| `session/cookie-strategy.ts` | System under test; all public methods (`credentialOf`, `resolveBearer`, `resolveCookie`, `issue`) are exercised. |
| `session/auth-context.ts` | `resolveProof` is fully mocked; tests assert it is called with `(userId, { authTime, amr })` and that its return drives the `{ ok }` result. |
| `session/mint-guard.ts` | Imports `SecondFactorRequiredError` and `StaleProofError` for `issue`-path rejection assertions. |
| `session/config.ts` | Imports `RefreshTokenExpiryTime` (used in the truncated portion for expiry assertions). |
| `account/repository.ts` | `sessionRepository` is partially mocked (all CRUD + family methods); typed via `asStub`. |
| `users/services/index.ts` | `userService.findAuthenticatableById` and `touchLastActive` are mocked. |
| `access/index.ts` / `access/service.ts` | `rolesOf` is mocked to resolve `{ tenant: 'customer', platform: null }`. |
| `infrastructure/security/hash-token.ts` | `hashToken` is the **real** implementation, used to compute the expected digest passed to `findByHash`. |
| `tests/strategy-doubles.ts` | Provides `cookieSet`, `recordingResponse`, and `requestWith` test helpers. |
| `tests/support/stub.ts` | `asStub<T>` casts mock objects back to their typed interfaces. |
| `tests/support/environment.ts` | `setEnvironment` seeds `NODE_SESSION_TIME_*` for expiry calculations. |

## Notes

- `jest.resetAllMocks()` (not `clearAllMocks`) is used in `beforeEach` so leftover resolutions from one case cannot leak into the next.
- The `@modules/users` and `@modules/account/repository` mocks use `jest.requireActual` spread to preserve non-targeted exports; only specific methods are replaced with `jest.fn()`.
- `@modules/account/session/auth-context` is replaced wholesale (no `requireActual`) because `resolveProof` is the only export the strategy calls.
- The strategy's `touch` throttle (≥ 60 s since last stamp) is a non-obvious behavior: a successful resolve does **not** guarantee a write.
- Cross-mode rows (a `jwt` row presented to the `cookie` resolver) are treated as **revoked**, not as a lookup failure — this is a deliberate security boundary, not a bug.
- `hashToken` is intentionally **not** mocked; tests assert the strategy hashes the id before any store call, which is a core invariant.
