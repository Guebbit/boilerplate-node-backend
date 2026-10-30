---
source: src/modules/account/tests/unit/jwt-strategy.test.ts
sha256: 7c6d8004f7cf9c53d587651e8e1a78b71b43a6041372af4aef4e6891e82c1b52
generated_at: 2026-10-29T03:04:52.757875+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/jwt-strategy.test.ts

## Purpose

Unit tests for the `jwtStrategy` adapter (`session/jwt-strategy.ts`). Validates the wiring between the strategy port and the token layer: which mint path a login takes versus a re-mint, which values land in which cookie, and the critical distinction that a token *refusal* (`TokenRejection`) resolves to a resolver miss while a *generic outage* propagates as a rejection. The token layer itself is tested in `session-jwt.test.ts` and is fully replaced here.

## Key elements

- **`jwtStrategy`** (imported from `session/jwt-strategy.ts`) — the SUT; exercised via its five public methods: `issue`, `reissue`, `remint`, `resolveBearer`, `resolveCookie`.
- **`tokens` stub** (`asStub` over the mocked `jwt` module) — typed handles for `startSession`, `continueSession`, `createAccessToken`, `rememberOfRefreshToken`, `verifyAccessToken`, `verifyRefreshToken`, `verifyRefreshWithRow`.
- **`sessions` stub** (`asStub` over the mocked `sessionRepository`) — typed handles for `removeByHash`, `removeFamilyByHash`, `removeFamilyExcept`, `findByHash`, `familyActivity`, `touchFamily`, `removeFamily`, `listLive`.
- **`proof` stub** (`asStub` over `resolveProof`) — the shared proof resolver from `auth-context`.
- **`describe('issue')`** — login path: `startSession` → `createAccessToken`; cookie `__Host-session` set without `maxAge` by default, with `maxAge` when `remember` tier is present; bearer transport ignored for cookies.
- **`describe('reissue')`** — refresh path: `continueSession` (not `startSession`); tier read from `rememberOfRefreshToken` or `snapshot`; old token retired via `removeByHash(hashToken(...))`; family cleanup via `removeFamilyExcept`; store failure during retirement is non-fatal.
- **`describe('remint')`** — unguarded `continueSession` path; sets a fresh refresh cookie; returns empty `{}` (no access token); a failed re-mint degrades silently (no cookie set, no throw).
- **`describe.each(['resolveBearer', 'resolveCookie'])`** — parameterized: each method calls its respective verifier, then `resolveProof`; `TokenRejection` → `{ miss: reason }`; generic `Error` → rethrown.
- **`describe('resolveBearer and the session it names')`** — additional assertions on session-family liveness checks during bearer resolution (content truncated in source).
- **`USER_ID`, `SHOPPER`, `FAMILY_ID`** — shared fixture constants; `SHOPPER` is a role-less account (no idle-timeout path).
- **`setEnvironment({ NODE_SESSION_TIME_MEDIUM: '86400' })`** — set in `beforeEach`; tests assert the resulting cookie `maxAge` as `86_400_000` ms.

## Relationships

| Neighbor | Interaction |
|---|---|
| `session/jwt-strategy.ts` | SUT — every `describe` block calls one of its methods. |
| `session/jwt.ts` | Mocked via `jest.mock`; `TokenRejection` class is **preserved** from the real module, all functions stubbed. |
| `session/auth-context.ts` | Fully mocked; `resolveProof` is a single `jest.fn()`. |
| `repository.ts` | Mocked; `sessionRepository` spread from actual to preserve non-stubbed members, then specific methods overridden. |
| `infrastructure/security/hash-token.ts` | Called in assertions to compute the expected hashed token value passed to `removeByHash`. |
| `types/index.ts` | `RememberTier` enum used in test inputs and expectations. |
| `tests/strategy-doubles.ts` | Provides `cookieSet`, `recordingResponse`, `requestWith` helpers. |
| `tests/support/stub.ts` | `asStub` gives typed access to `jest.fn()` handles. |
| `tests/support/environment.ts` | `setEnvironment` configures process-level session-time variables per test. |

## Notes

- **`TokenRejection` is intentionally NOT mocked.** The mock factory calls `jest.requireActual` and re-exports the real class so that the "refusal → miss" vs "outage → reject" contract is testable with the actual error type.
- **`rememberOfRefreshToken` defaults to `undefined`** in `beforeEach`; tests that need a tier override it locally (e.g., `.mockResolvedValue(RememberTier.medium)`).
- **Cookie `maxAge` is asserted in milliseconds** (`86_400_000`) while the environment variable is set in seconds (`'86400'`) — the strategy layer converts.
- **`resolveBearer` / `resolveCookie` are tested via `describe.each`** with the verifier name as a string key into the `tokens` stub; the two verifiers (`verifyAccessToken` vs `verifyRefreshToken`) share identical assertion shape.
- **The file is a unit test**, not an integration test: every external boundary (token mint/verify, store, proof resolver) is a stub; no real network, DB, or crypto runs.
