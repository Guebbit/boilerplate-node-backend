---
source: src/modules/account/tests/unit/oauth-providers.test.ts
sha256: ae6caf8e11c389b189e2a71c1e5f97df459ef176dcee0dceda9c5da643b08725
generated_at: 2026-09-23T18:16:14.181677+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/oauth-providers.test.ts

## Purpose

Unit tests for the OAuth provider registry's visibility logic (which providers are listed/resolved given the current environment) and for the `fake` provider's authorize/exchange round-trip. The file deliberately tests "which providers show up at all," not per-provider token-exchange parsing (that belongs to separate test files for Google and GitHub).

## Key elements

- **`OAUTH_ENV_KEYS`** – typed const array of the four `NODE_OAUTH_*` env vars; saved before each test and restored after, so the suite is hermetic.
- **`describe('the OAuth provider registry')`** – asserts `enabledProviders()` and `resolveOAuthProvider()`:
  - Empty list when no credentials are set and demo profile is off.
  - Google appears only when *both* client id and secret are present.
  - GitHub is independent of Google.
  - `fake` appears only when `enableDemoProfile()` is active; requires no credentials.
  - Unrecognised provider names resolve to `undefined` (no throw).
- **`describe('fakeOAuthProvider')`** – exercises the fake implementation directly:
  - `authorizeUrl()` produces a callback URL carrying a fixed code, PKCE challenge, and state.
  - A full `authorizeUrl → exchangeCode` round-trip yields a deterministic, verified identity.
  - `exchangeCode()` rejects codes that are not `FAKE_OAUTH_CODE`.
  - `exchangeCode()` rejects a PKCE verifier that doesn't hash to the presented challenge.

## Relationships

- **`src/modules/account/oauth/providers/index.ts`** – source of `enabledProviders` and `resolveOAuthProvider`, the two functions under test in the first `describe` block.
- **`src/modules/account/oauth/providers/fake.ts`** – source of `fakeOAuthProvider` and the `FAKE_OAUTH_CODE` constant; all second-`describe` assertions call into this object.
- **`src/modules/account/oauth/state.ts`** – provides `generateCodeVerifier` and `codeChallengeOf`, used to construct valid PKCE pairs for the fake-provider tests.
- **`src/infrastructure/runtime/demo-profile.ts`** – `enableDemoProfile` toggles the demo mode that gates the `fake` provider; called in the relevant test and reset in `afterEach`.

## Notes

- The module doc-block explicitly scopes this file to registry visibility and contrasts it with the per-provider token-exchange tests; don't expect Google/GitHub exchange logic here.
- `afterEach` disables the demo profile *after* restoring env vars, so a test that enables demo mode but forgets to disable it won't leak into the next suite.
- The fake provider's `exchangeCode` is purely synchronous logic (no network); tests assert rejection via thrown errors rather than mocking fetch.
