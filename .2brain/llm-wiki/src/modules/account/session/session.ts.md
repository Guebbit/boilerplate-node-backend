---
source: src/modules/account/session/session.ts
source_sha256: 2751bcf84582b02ee9da391837da3069c5ac445e8c7cfd75fbf7399af1ee5e35
context_sha256: e0148d58076887b20dafc226d7392cf4826058e711fc3cd3f9c7b60b98a1009d
generated_at: 2026-11-22T03:48:58.166725+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/session.ts

## Purpose
A thin facade that gives every flow that mints or re-mints a live session (login, signup, 2FA, OAuth callback, reauth, password change, factor change) a single set of calls. Controllers use these and never learn which session mode is active; that choice is delegated to `activeStrategy()` from `./strategy`.

## Key elements
- `issueSession(request, response, userId, options)`: mints a session for an account and sets its credential on the response. Returns `IssuedSession` (the credential fields for the response body). Can throw when the session can't be persisted or signed, `SecondFactorRequiredError` (first session on an account whose second factor `amr` doesn't carry), or `StaleProofError` (the account ended its sessions after `provedAt`).
- `sessionSnapshotOf(request, userId)`: reads what the caller's own session carries (`SessionSnapshot`). It's meant to be called before a change that deletes that session.
- `reissueSession(request, response, userId, options)`: re-mints the caller's session while keeping its persistence, so a remembered login isn't downgraded to a session cookie, and the reverse. Options carry `amr` and an optional `snapshot`.
- `remintSession(request, response, userId, amr, snapshot?)`: re-mints the caller's session after a change that revoked all sessions, including theirs (a 2FA factor change). It carries the caller's `amr` over unchanged. Its doc says it never fails the response: a failed re-mint degrades to "sign in again" and is logged.
- `sessionCredentialOf(request)`: returns the credential that names the caller's own session, which is what `current` is matched against and what logout deletes. It returns `undefined` for callers authenticated another way.
- `SessionCaller` (internal type): `SessionRequest & Pick<Request, 'get'>`.

## Relationships
- `./strategy`: the only dependency. Each function forwards to the matching method on `activeStrategy()` (`issue`, `snapshot`, `reissue`, `remint`, `credentialOf`). It also supplies the types `IssuedSession`, `IssueOptions`, `ReissueOptions`, `SessionRequest` and `SessionSnapshot`.
- Controllers in `src/modules/account/controllers/` are the callers, per the module doc:
  - login and signup flows: `post-login`, `post-login-2fa`, `post-login-restore`, `post-signup`, `get-oauth-callback`
  - re-authentication and credential changes: `post-reauth`, `post-password-change`, `post-2fa-confirm`, `post-2fa-disable`, `post-2fa-method-remove`
  - session ending and listing: `post-logout`, `delete-session`
  
  The file doesn't show which function each controller calls.

## Notes
- The call order matters for password and factor changes: take `sessionSnapshotOf` before the change deletes the session, then pass the snapshot to `reissueSession` or `remintSession`.
- `reissueSession` is for reauth and password change. `remintSession` is for changes that revoke every session.
