---
source: shared/rules/cookies.yaml
source_sha256: 332e6d05a5186e863fca775dea7b20b8350ad031d24c97e95ff7efcb69a33da7
context_sha256: 0c95844c03af7e2bb807e99f0749eb3d86ac3c2fe5ae589f772b2d352b59cdfd
generated_at: 2026-11-22T02:25:30.039914+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/cookies.yaml

## Purpose
Single source of truth for every cookie the backend sets. The code that sets each cookie reads its name and lifetime from here, and the log scrubber reads the `secret: true` entries to know what to redact. The file's header comment says a data-protection doc links here and that the paired frontend has its own browser-storage file in the same format for what it stores itself.

## Key elements
Each entry under `cookies:` is keyed by a camelCase id, which is also the frontend's translation key for the purpose text. Fields per entry: `name`, `setter` (all `backend`), `kind` (all `cookie`), `purpose`, `necessity` (all `necessary`), `secret`, and a lifetime.

- `session` (`__Host-session`, secret): the httpOnly credential. It holds the refresh token in `jwt` mode and the session id in `cookie` mode. Its name equals the contract's `cookieAuth.name`. Lifetime: `sessionTier`.
- `isAuth` (`isAuth`, not secret): a signed-in flag for the client, not a credential. Same lifetime as the session cookie (`sessionTier`).
- `device` (`__Host-device`, secret): up to five HMAC tokens, one per account. Max age is 15552000000 ms (180 days), renewed on each successful login.
- OAuth sign-in cookies, all `__Host-` prefixed with `maxAgeMs: 300000` (5 minutes):
  - `oauthState` (secret): CSRF state.
  - `oauthVerifier` (secret): PKCE verifier.
  - `oauthContinue` (not secret): return page.
  - `oauthLocale` (not secret): language.
  - `oauthLink` (secret): link attempt, set only when a signed-in account connects a provider.
- `oauthMfaChallenge` and `oauthDeletionChallenge` (both secret): carry the second-factor challenge and the restore-a-pending-deletion claim check across the provider redirect. Lifetime is `challenge`.

## Relationships
- `shared/rules/log-redaction.yaml`: log redaction is that file's rules UNION the `secret: true` names in this file. The twin implementation must do the same.

## Notes
- Lifetime is expressed in one of three ways: `maxAgeMs` (fixed), `lifetime: sessionTier`, or `lifetime: challenge`. The comments say challenge cookies last as long as the challenge they carry, read off the challenge rather than from this file.
- `oauthContinue` and `oauthLocale` are deliberately not secret (a path and a language code), so they stay readable in logs.
- A cross-cutting test keeps `session.name` equal to the contract's `cookieAuth.name`.
- The `__Host-` prefix is on every cookie except `isAuth`.
