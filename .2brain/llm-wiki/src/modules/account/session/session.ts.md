---
source: src/modules/account/session/session.ts
sha256: 43f534d7ba0f32ef1364b7bb3dd1085585110c547a2fd32e3b17a0ab99627eb9
generated_at: 2026-11-08T04:30:13.697295+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/session.ts

## Purpose

A thin facade that every session-issuing controller calls. It exposes four operations (`issue`, `snapshot`, `reissue`, `remint`) plus a credential lookup, each of which simply delegates to `activeStrategy()`. Controllers never need to know which session mode (cookie vs. bearer-token) is active — they just call these and get back credential fields to put on the response.

## Key elements

- **`issueSession(request, response, userId, options)`** — Mints a brand-new session (login, signup, OAuth callback, 2FA confirm). Returns `IssuedSession` (the wire-level token fields). Throws `SecondFactorRequiredError` or `StaleProofError` on policy failures.
- **`sessionSnapshotOf(request, userId)`** — Reads the caller's *current* session state (persistence tier, device identity) *before* a change that will delete it. Must be called before the destructive operation.
- **`reissueSession(request, response, userId, options)`** — Replaces the caller's session while preserving its persistence tier. Used after reauth or password change, where the old session is deleted and a new one must keep "remember me" vs. "this browser" semantics.
- **`remintSession(request, response, userId, amr, snapshot?)`** — Re-mints after a change that revoked *all* sessions (e.g. 2FA factor change). Deliberately never propagates a failure to the caller; on error it degrades to "sign in again" rather than reporting the change as failed.
- **`sessionCredentialOf(request)`** — Returns the credential string identifying the caller's own session on this request (used by logout and `current`-session matching). Returns `undefined` if the caller was authenticated some other way.

## Relationships

- **`./strategy`** — Sole implementation target. Every export is a one-line delegation to `activeStrategy().<method>(…)`. This file adds no logic; it is the public surface controllers import.
- **Controllers** (`post-login`, `post-signup`, `post-2fa-confirm`, `post-login-2fa`, `get-oauth-callback`, `post-reauth`, `post-password-change`, `post-2fa-disable`, `post-2fa-method-remove`, `post-login-restore`, `post-logout`, `delete-session`) — Call the functions above. Typical call sequence for a destructive-then-re-mint flow: `sessionSnapshotOf` → perform change → `reissueSession` or `remintSession`.

## Notes

- `sessionSnapshotOf` must be called **before** the operation that deletes the session (password change, factor change); calling it after will read nothing.
- `remintSession` swallows persistence errors by design — the caller's change has already committed, so surfacing a re-mint failure would be misleading.
- The `SessionCaller` type is a local convenience alias (`SessionRequest & Pick<Request, 'get'>`); it is not exported.
- The JSDoc on each function references `docs/modules/account-sessions.md` and `docs/theory/sessions.md` for the higher-level design rationale.
