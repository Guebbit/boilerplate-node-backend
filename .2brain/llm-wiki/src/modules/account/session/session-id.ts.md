---
source: src/modules/account/session/session-id.ts
source_sha256: 23bf0900c548d61c605ee90fae88b7703673f0fe282bcb1be81a1a43ed5a946d
context_sha256: d741ca2d42c3f345e9c8d1f62c69d666e189ab839be33d4d3283534d30a4b66f
generated_at: 2026-11-22T03:48:44.710632+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/session-id.ts

## Purpose
Generates and recognizes the opaque session id used by `cookie` authentication mode. An id is 32 random bytes, base64url-encoded, behind the kernel's `ses_` prefix (same shape as an `sk_…` key). Only its sha256 is meant to be stored (via `@infrastructure/security/hash-token`), so a database read yields nothing a request could present. With 256 bits of entropy, a fast hash suffices and no signing secret is needed.

## Key elements
- `newSessionId()` — returns `SESSION_TOKEN_PREFIX` + 32 `randomBytes` as base64url. This is the only moment the plaintext exists on the server.
- `looksLikeSessionId(token)` — true if the token starts with `SESSION_TOKEN_PREFIX`. A cheap pre-lookup refusal, so a JWT, an `sk_…` key or noise never costs a query.
- `looksLikeJwt(token)` — true if the token matches `/^eyJ[\w-]*\.[\w-]+\.[\w-]*$/`: three base64url segments, the first starting with `eyJ` (an encoded `{"`). Checks shape only, not validity.

## Relationships
- `src/kernel/authentication.ts` — supplies `SESSION_TOKEN_PREFIX`, the prefix the kernel dispatches on.
- `src/modules/account/session/cookie-strategy.ts` and `jwt-strategy.ts` — the cookie and `jwt` mode strategies, the natural consumers of these helpers. The shape checks distinguish session ids from JWTs; this file itself does not import them.
- `src/modules/account/tests/unit/session-id.test.ts` — unit tests for this file.

## Notes
- Shape checks do no verification: `looksLikeJwt` does not say whether a JWT verifies (that is `jwt` mode's concern), and `looksLikeSessionId` does not say whether the session exists.
- Hashing for storage is not done here; the file only produces the plaintext id.
