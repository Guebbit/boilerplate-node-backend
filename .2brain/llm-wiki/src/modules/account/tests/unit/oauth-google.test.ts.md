---
source: src/modules/account/tests/unit/oauth-google.test.ts
sha256: e766dbf2d6ab298bfab825b8b9431a06e4a97377ab19b07f19531bd611ba6064
generated_at: 2026-09-23T18:16:03.812370+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/oauth-google.test.ts

## Purpose

Unit tests for the Google OAuth provider. They verify the authorization-URL construction, the "is this provider configured" gate, and the full set of claim validations (`aud`, `iss`, `exp`, `sub`) performed during code-to-token exchange. `fetch` is stubbed throughout because the network boundary belongs to the provider under test, not to this file.

## Key elements

- **`idToken(claims)`** – Signs arbitrary claims with a throwaway HS256 key (`noTimestamp`). The signature is never checked by the provider; the function exists solely to produce a decodable JWT shape.
- **`mockTokenResponse(idTokenValue)`** – Spies on `globalThis.fetch` to return a 200 response whose `id_token` field is the supplied value (or `undefined`).
- **`originalEnvironment`** – Captures the dev's real `NODE_OAUTH_GOOGLE_CLIENT_ID` / `_SECRET` so `afterEach` can restore or delete them faithfully.
- **`describe('google provider configuration')`** – Asserts `isOAuthProviderConfigured('google')` is `true` when both env vars are set and `false` when either is missing.
- **`describe('googleOAuthProvider.authorizeUrl')`** – Parses the returned URL and checks origin, path, and every query parameter (`client_id`, `redirect_uri`, `response_type`, `state`, `scope`, `code_challenge`, `code_challenge_method`).
- **`describe('googleOAuthProvider.exchangeCode')`** – The main block. Covers happy-path identity mapping, alternate issuer spelling, and rejection on wrong `aud`, unknown `iss`, expired `exp`, missing `id_token`, non-2xx status, explicit `email_verified: false`, missing `sub` (B15), and a hung-fetch abort via `AbortSignal` (B15).

## Relationships

- **`src/modules/account/oauth/config.ts`** – Imports `isOAuthProviderConfigured` and exercises it in the configuration suite.
- **`src/modules/account/oauth/providers/google.ts`** – Imports `googleOAuthProvider` and calls `authorizeUrl` and `exchangeCode`; every assertion in this file is a contract test against that object's behavior.
- **`jsonwebtoken`** (external) – Used only by the `idToken` helper to mint decodable JWTs; never imported by the provider itself.

## Notes

- **Signature is irrelevant by design.** The `idToken` helper signs with `'irrelevant-signing-key'`; the provider only _decodes_ and validates claims, so tests can focus on claim logic without a real key pair.
- **Env-var teardown is delete-vs-restore.** If a variable was `undefined` before the test, `afterEach` _deletes_ the key rather than setting it to `undefined`, avoiding a truthy string `''` in the process environment.
- **B15 regression tests are inline-commented.** Two tests carry `/* B15: … */` blocks explaining the original bug (undefined `providerId` collision; unbounded fetch hang) and why the assertion is shaped the way it is.
- **Abort test is deliberately over-built.** The `fetch` mock ignores its input and only settles when the request's own `AbortSignal` fires, proving the signal is actually threaded through to the network call rather than just checking that a timer exists.
- **`email_verified: false` ≠ missing.** A dedicated test ensures an explicit `false` is surfaced as `emailVerified: false` in the returned identity, not silently dropped to the same state as an absent claim.
