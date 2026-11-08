---
source: src/modules/account/tests/unit/cookie-strategy.test.ts
sha256: f1b79bc1fb89bff490fc45a0dd6233cc5092a074a044cfff6daf8a4374209f9d
generated_at: 2026-11-08T04:45:58.386992+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/cookie-strategy.test.ts

## Purpose

Unit-level tests for the `cookie` session-mode adapter (`cookie-strategy.ts`). Verifies credential extraction from requests, the resolve pipeline (malformed → revoked → expired → proof resolution → touch-stamp), and the `issue` guards (user-not-found, 2FA, stale-proof). All collaborators are replaced with mocks; integration concerns (real store, HTTP) are deferred to `session-modes.test.ts`.

## Key elements

- **`credentialOf` suite** — asserts bearer-token extraction, case-insensitive scheme parsing, cookie fallback, and the "neither present" → `undefined` case.
- **`resolveBearer` / `resolveCookie` suite** (parameterized via `describe.each`) — exercises the full resolve ladder: malformed shape, JWT-as-revoked, digest-based lookup, row-not-found, wrong-mode row, expired row, proof hand-off to `resolveProof`, empty-proof defaulting (`authTime: 0`, `amr: []`), account-gone → `ok: undefined`, touch-stamp debounce (> 60 s), and touch-failure resilience.
- **`issue` suite** — verifies rejection for missing user, `SecondFactorRequiredError` on armed 2FA accounts, `StaleProofError` when `provedAt` precedes `tokensValidAfter`, and `authTime` stamping in seconds.
- **`liveRow(overrides?)`** — factory returning a well-formed `NewSessionRow` for the fixed `USER_ID`, one-hour expiry, `pwd` AMR; spread with caller overrides.
- **`insertedRow()`** — helper that pulls the last `sessions.insert` call argument, typed as `NewSessionRow`.
- **`sessions` / `users` / `proof`** — `asStub`-typed views over the respective mocks, giving call-argument typing without repeated `jest.mocked` casts.

## Relationships

| Neighbor | Interaction |
|---|---|
| `session/cookie-strategy.ts` | Unit under test (`credentialOf`, `resolveBearer`, `resolveCookie`, `issue`). |
| `session/auth-context.ts` | `resolveProof` is fully mocked; tests assert it is called (or not) with expected args. |
| `session/mint-guard.ts` | `SecondFactorRequiredError` and `StaleProofError` are the expected rejection types in `issue` tests. |
| `account/repository.ts` | `sessionRepository` methods (`insert`, `findByHash`, `removeByHash`, `touch`, `familyActivity`, `touchFamily`, `removeFamily`, `listLive`) are individually mocked. |
| `users/index.ts` (+ `users/services/index.ts`) | `userService.findAuthenticatableById` and `touchLastActive` mocked. |
| `access/index.ts` (+ `access/services/index.ts`) | `accessService.rolesOf` mocked to return `{ tenant: null, platform: null }`. |
| `infrastructure/security/hash-token.ts` | `hashToken` called directly to compute the expected digest in `findByHash` assertions. |
| `tests/strategy-doubles.ts` | `requestWith`, `recordingResponse`, `cookieSet`, `asStub` helpers. |
| `tests/support/environment.ts` | `setEnvironment` pins `NODE_SESSION_TIME_SHORT`/`LONG` for each test. |
| `tests/support/stub.ts` | Source of the `asStub` cast helper. |
| `types/index.ts` | `RememberTier` imported (used in `issue` tests for session-tier resolution). |

## Notes

- `beforeEach` calls `jest.resetAllMocks()` (not `clearMocks`) deliberately: any leftover `mockResolvedValue` from a prior test would silently leak into the next.
- The parameterized resolve suite runs the identical assertions against both `resolveBearer` and `resolveCookie`; if the two diverge, both suites must be kept in sync manually.
- Touch-stamp debounce threshold is hard-coded to 60 seconds in the test data (`61_000` ms past vs. now); the strategy's actual threshold lives in `cookie-strategy.ts`.
- `insertedRow()` throws if `insert` was never called — use it only after an `issue` test that expects a successful insert.
- The file is truncated in the graph dump; the `issue` suite likely continues with assertions on the stored row shape and the `Set-Cookie` response header.
