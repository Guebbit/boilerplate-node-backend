---
source: src/modules/account/tests/unit/cookie-strategy.test.ts
sha256: b76d5a4b249e0480de33e0ea0289b730ee1169e3cbb8e17d730b1a1afd54d707
generated_at: 2026-10-14T14:44:43.750258+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/cookie-strategy.test.ts

## Purpose

Unit tests for the `cookieStrategy` adapter (the `cookie` session mode). Exercises three surfaces — credential extraction, id resolution, and session issuance — with the session store, user lookup, and proof resolver all replaced by stubs. Integration-level guarantees (real store, real HTTP) are deferred to `../integration/session-modes.test.ts`.

## Key elements

- **`credentialOf` suite** — verifies bearer-first extraction, case-insensitive scheme, cookie fallback, and the "neither" case.
- **`resolveBearer` / `resolveCookie` suite** (`describe.each`) — parameterized over both resolve methods; covers malformed rejection, digest-only lookup, mode-mismatch rejection, expiry detection, proof delegation, missing-proof fallback (`authTime: 0, amr: []`), `ok: undefined` short-circuit, and fault tolerance of the `touch` stamp.
- **`issue` suite** — covers user-not-found, two-factor gating (`SecondFactorRequiredError`), digest-only persistence, bearer vs. browser transport, short-tier default expiry, `remember` tier alignment between cookie `maxAge` and row `expiresAt`, and device-name extraction from `User-Agent`.
- **`asStub`** (from `@tests/stub`) — gives typed access to `jest.Mock` internals (`mock.calls`, `mockResolvedValue`, etc.) without `any`.
- **`setEnvironment`** (from `@tests/environment`) — pins `NODE_SESSION_TIME_SHORT`/`LONG` so expiry math is deterministic.
- **`liveRow()`** — factory returning a well-formed `NewSessionRow` for the test account, overridable per case.
- **`insertedRow()`** — reads the last `insert` call argument; throws if the strategy never persisted.
- **`cookieSet`, `recordingResponse`, `requestWith`** (from `../strategy-doubles`) — shared request/response doubles shared with other strategy tests.

## Relationships

| Neighbor | Interaction |
|---|---|
| `session/cookie-strategy.ts` | **System under test** — all `cookieStrategy.*` calls. |
| `account/repository.ts` | Mocked: `sessionRepository.insert / findByHash / removeByHash / touch / listLive`. |
| `session/auth-context.ts` | Mocked wholesale: `resolveProof` — test asserts only *whether* it is called and with what args. |
| `session/config.ts` | Imported for `RefreshTokenExpiryTime.LONG` in the remember-tier test. |
| `session/mint-guard.ts` | Imported for `SecondFactorRequiredError` (two-factor refusal assertion). |
| `infrastructure/security/hash-token.ts` | Imported for `hashToken` used to assert digest-only storage and lookup. |
| `modules/users/index.ts` | Mocked: `userService.findAuthenticatableById`, `touchLastActive`. |
| `modules/users/services/index.ts` | The concrete service object that the `@modules/users` mock spreads. |
| `tests/support/environment.ts` | `setEnvironment` sets session-time env vars before each case. |
| `tests/support/stub.ts` | `asStub` wraps the jest mocks with a typed shape. |
| `tests/strategy-doubles.ts` | `cookieSet`, `recordingResponse`, `requestWith` helpers. |

## Notes

- `beforeEach` uses `jest.resetAllMocks()` (not `clearAllMocks`) deliberately: each case sets its own mock resolutions, and a leftover resolution from a prior case would silently change the next case's behaviour.
- The `resolveBearer`/`resolveCookie` suite is parameterized via `describe.each` so both entry points are asserted identically; adding a new resolve method to the strategy requires extending the array.
- `insertedRow()` intentionally throws rather than returning `undefined` — a test that expects a row but the strategy skipped the insert gets a loud, localized failure.
- The `auth-context` mock replaces the entire module (no `requireActual` spread), because the unit test has zero interest in *what* proof means — only that the strategy forwards the stored `authTime`/`amr` pair.
- Expiry-boundary assertions use `before = Date.now()` captured before the call and assert `expiresAt` within `[before + TTL, now + TTL]` to tolerate the clock advancing mid-test.
