---
source: src/modules/account/session/session.ts
sha256: 43f534d7ba0f32ef1364b7bb3dd1085585110c547a2fd32e3b17a0ab99627eb9
generated_at: 2026-10-15T10:08:45.724025+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/session.ts

## Purpose

Facade module that gives every session-minting controller a single, mode-agnostic API. Controllers call these five functions and never learn whether the system is in `cookie` or token mode — that decision is delegated entirely to `activeStrategy()` in `strategy.ts`.

## Key elements

- **`issueSession(request, response, userId, options)`** — Mints a brand-new session for a successful auth event (login, signup, OAuth callback, 2FA confirm) and writes the credential onto the response. Throws `SecondFactorRequiredError` or `StaleProofError` on failure.
- **`sessionSnapshotOf(request, userId)`** — Captures the caller's current session state (persistence tier, identity) *before* a change that will delete that session, so a subsequent re-mint can restore it.
- **`reissueSession(request, response, userId, options)`** — Replaces the caller's live session after a password change or reauth, preserving its persistence tier.
- **`remintSession(request, response, userId, amr, snapshot?)`** — Re-mints after a 2FA factor change that revoked *all* sessions. Deliberately never propagates an error to the response; a failed re-mint degrades to "sign in again."
- **`sessionCredentialOf(request)`** — Returns the credential string that identifies the caller's own session on this request (used by logout and `current` matching). Returns `undefined` if the caller authenticated via another mechanism.
- **`SessionCaller`** (internal type) — `SessionRequest & Pick<Request, 'get'>`, the request shape every function here expects.

## Relationships

- **`./strategy`** — Every exported function is a thin delegation to the corresponding method on `activeStrategy()`. This file adds no logic of its own; it exists so that the eleven controller files below can import one stable symbol list instead of reaching into the strategy layer.
- **Controllers** (`post-login`, `post-signup`, `post-login-2fa`, `post-2fa-confirm`, `get-oauth-callback`, `post-reauth`, `post-password-change`, `delete-2fa`, `delete-2fa-method`, `delete-session`, `post-logout`) — Each imports only the functions it needs from this module (e.g., login calls `issueSession`; password-change calls `sessionSnapshotOf` then `reissueSession`; 2FA factor change calls `sessionSnapshotOf` then `remintSession`; logout calls `sessionCredentialOf`). No controller imports `strategy.ts` directly.

## Notes

- Callers must invoke `sessionSnapshotOf` **before** the destructive operation (password change, factor change); the snapshot is then passed to `reissueSession` or `remintSession` to restore persistence and identity.
- `remintSession` swallows re-mint failures internally — the controller should treat the response as successful even if the session was not actually renewed.
- The module doc comment references `docs/modules/account-sessions.md` and `docs/theory/sessions.md` for the broader session model.
