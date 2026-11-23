---
source: src/modules/account/session/strategy.ts
source_sha256: 197cdb6f8193e6d763e4c418ef2708013e5f60c5cdb374d6f24192a8f56c1d8d
context_sha256: d42a92dbc11293b0b5c2b4a67a865e03b9a4ba45806781469c1b665e4090461d
generated_at: 2026-11-22T03:49:16.653378+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/strategy.ts

## Purpose
Defines the session "port": one `SessionStrategy` interface with two adapters, `jwt` (short access token plus rotating refresh token) and `cookie` (random id stored hashed, sent as an HttpOnly cookie or a `ses_…` bearer). Callers such as login, 2FA, OAuth callback, reauth and the resolver call `activeStrategy()` and never check which mode is on. The mode is chosen once per process from `NODE_SESSION_MODE`.

## Key elements
- `SessionStrategy`: the interface both adapters implement.
  - `mode` and `cookieAuthenticates`: which mode it is, and whether the cookie authenticates ordinary routes or only the two SSE streams.
  - `issue`: mints a session at login and writes its credential to the response.
  - `snapshot`: reads the caller's current session (tier, family, start and expiry, device) before a change deletes it.
  - `reissue`: replaces the caller's session with one claiming a new `amr` (reauth, password change).
  - `remint`: re-mints the caller's session after a change that ended all sessions (a second-factor change). It never fails the response and returns an empty `IssuedSession` on failure.
  - `resolveBearer` and `resolveCookie`: turn a credential into `Resolution<AuthContext | undefined>`.
  - `watchCookie`: resolves an SSE stream's cookie and keeps its session family, so rechecks survive rotation or re-proof.
  - `credentialOf`: returns the credential naming the caller's own session on a request.
  - `list`: returns the account's live sessions, marking the one that matches `credential`.
- `activeStrategy()`: returns `cookieStrategy` when `getSessionMode()` is `'cookie'`, otherwise `jwtStrategy`.
- `SESSION_TRANSPORTS` and `SessionTransport`: `'cookie'` or `'bearer'`, the login's `transport` choice.
- `IssueOptions`: `remember`, `amr`, `provedAt` (epoch ms, when the proof's check began) and `transport`.
- `SessionSnapshot`, `IssuedSession` (`token`, `sessionToken`), `ReissueOptions` and `SessionRequest` (a `Pick` of `Request` limited to `cookies`, `headers` and `sessionVia`): supporting types.

## Relationships
- `src/modules/account/session/jwt-strategy.ts` and `src/modules/account/session/cookie-strategy.ts` are the two adapters. They are imported here and selected by `activeStrategy()`.
- `src/modules/account/session/config.ts` supplies `getSessionMode()`.
- `src/modules/account/session-mode.ts` supplies the `SessionMode` type.
- `src/kernel/authentication.ts` supplies the `Resolution` and `StreamWatch` types used in the resolve and watch signatures.
- The controllers `post-login.ts`, `post-2fa-confirm.ts`, `post-2fa-disable.ts`, `post-2fa-method-remove.ts` and `post-password-change.ts` (in `src/modules/account/controllers/`), `src/modules/account/services/sessions.ts`, `src/modules/account/session/resolver.ts` and `src/modules/account/session/session.ts` sit in the dependency graph around this port. From this file alone, the code says only that callers go through `activeStrategy()`.

## Notes
- The mode is read on every `activeStrategy()` call, not frozen at import, so a test or restart that changes it is honoured.
- Switching mode signs everyone out, because a session row belongs only to the mode that issued it.
- `issue` can throw `SecondFactorRequiredError` (a first session on a 2FA account whose `amr` lacks `otp`) or `StaleProofError` (the account's epoch moved after `provedAt`).
- `transport` only matters in `cookie` mode. `jwt` always sets its refresh cookie and returns an access token.
- `snapshot` must be read before the change that deletes the session, so that `reissue` or `remint` can continue it.
