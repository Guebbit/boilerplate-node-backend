---
source: src/modules/account/tests/unit/session-jwt.test.ts
sha256: 6e9723401b5aae854978d3c7ca5617647bed9e61be9ad83054e5b6c60bedaf70
generated_at: 2026-10-14T14:45:41.313785+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-jwt.test.ts

## Purpose

Unit test suite for the token layer in `session/jwt.ts`. Asserts the safety invariants of access/refresh token verification: that the two secrets never cross-verify, that a refresh token is only valid while its row is still stored, that `jti` prevents same-second logins from revoking each other, and that the signing ring rotates without mass logout. The session store and user service are replaced with mocks; the correctness of the underlying queries is deferred to `../integration/auth-storage.test.ts`.

## Key elements

- **`jest.mock('@modules/users', …)`** — spreads the real module and overwrites `userService.findAuthenticatableById` and `touchLastActive` with `jest.fn()`.
- **`jest.mock('@modules/account/repository', …)`** — spreads the real module and overwrites `sessionRepository.findByHash` and `insert` with `jest.fn()`.
- **`signAs(secret, payload, opts?)`** — signs a JWT the same way `jwt.ts` does: stamps `kid: keyId(secret)`, sets `typ` per RFC 9068 (`at+jwt` / `rt+jwt`), and includes `auth_time` + `amr` defaults. Accepts `expiresIn` and `typ` overrides for negative cases.
- **`holdingLive()`** — wires `findByHash` to return a live `jwt` row and `findAuthenticatableById` to return an eligible user; simulates the "token still stored" branch of `verifyRefreshToken`.
- **`mintable()`** — wires the same two user-service mocks plus `sessionRepository.insert` so `startSession` can complete.
- **`describe('verifyAccessToken')`** — covers: valid access token, missing `sid`, cross-secret (refresh signed as access), forged signature, expired, reason classification (`expired` / `invalid_signature` / `malformed`), missing `exp`, missing claims, `alg:none` with and without a real `kid`.
- **`describe('verifyRefreshToken')`** — covers: valid + stored, valid but no longer stored (revocation). *(Truncated in source; additional cases likely follow.)*
- **`describe('createAccessToken')` / `describe('startSession')`** — imported and exercised (content beyond truncation).

## Relationships

- **`src/modules/account/session/jwt.ts`** — the module under test; all four exported functions are imported and asserted.
- **`src/modules/account/session/key-ring.ts`** — provides `keyId()` used by `signAs` and the `alg:none` fixtures to stamp a valid `kid` header.
- **`src/infrastructure/security/hash-token.ts`** — provides `hashToken()` used to assert that `findByHash` is called with the token's digest, not a raw value.
- **`src/modules/account/repository.ts`** — its `sessionRepository` is the mock target for storage-level assertions.
- **`src/modules/users/index.ts`** — mocked at module boundary so `userService` members can be individually stubbed while other members pass through.
- **`src/modules/users/services/index.ts`** — the concrete implementation behind the `userService` mock (mocked, not directly called).
- **`tests/support/environment.ts`** — provides `setEnvironment()` to inject `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, and session-duration vars in `beforeEach`.
- **`tests/support/stub.ts`** — provides `asStub()` for type-safe access to the `jest.fn()` members of the mocked objects.

## Notes

- `jest.resetAllMocks()` (not `clearAllMocks`) is used in `beforeEach` so that per-test mock implementations (resolved/rejected) do not leak into the next case.
- Every fixture must carry `kid: keyId(secret)`; a token without a `kid` will fail ring-member lookup and never reach signature verification.
- `alg:none` tokens are hand-constructed with `Buffer.from(…).toString('base64url')` because no signing library emits that header.
- The `typ` header follows RFC 9068: access tokens carry `at+jwt`, refresh tokens carry `rt+jwt`. Negative tests override `typ` to exercise mismatch cases.
- Refresh-token validity is **two-gated**: signature must verify *and* `sessionRepository.findByHash(hashToken(token))` must return a row. This is the revocation path.
- This suite is deliberately a **unit** test. Query correctness (what `findByHash` actually does against a real store) is covered in `../integration/auth-storage.test.ts`.
