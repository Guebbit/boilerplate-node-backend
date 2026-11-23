---
source: src/infrastructure/http/cookies.ts
source_sha256: 31d9abe2ec4c230cba55b3aa5d98ef8a71df50149759b95d7f6f90c62c58b8bd
context_sha256: 4f6595d93c1a9a088b2de6d98507817eef8a463779c343e885443c4f54f4c1fb
generated_at: 2026-11-22T02:47:37.063719+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/cookies.ts

## Purpose
Provides a single helper for reading one named cookie off an incoming Express request. It is generic transport plumbing: deciding which cookie counts as a credential is left to the caller (`@kernel/cookies` names the refresh token).

## Key elements
- `cookieOf(request, name)` — returns the cookie's value as a `string`, or `undefined` if the cookie was never set or its value is not a plain string. The `request` parameter is typed `Pick<Request, 'cookies'>`, so any typed `Request<…>` a controller holds is accepted.

## Relationships
- Imports only the `Request` type from `express`.
- `src/kernel/cookies.ts` is the counterpart named in the module doc. It names the refresh-token cookie, while this file does the generic reading.
- The neighbors `get-oauth-callback.ts`, `deletion-redirect.ts` and `mfa-redirect.ts` (under `src/modules/account/`) are in the dependency graph with this file. The file content doesn't show how they use it.
- `tests/unit/infrastructure/http/cookies.test.ts` is the unit test for this helper.

## Notes
- cookie-parser turns a `j:`-prefixed cookie value into parsed JSON, which can be an object. `cookieOf` deliberately returns `undefined` for any non-string value, so callers never see an object as a credential.
- The `cookies` type hides this case, so the code makes one `as Record<string, unknown>` cast to widen it before the `typeof` check.
