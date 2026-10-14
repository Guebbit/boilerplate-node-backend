---
source: src/modules/account/session/session.ts
sha256: 971dc6476c628d6a33020bd7da24711a60e13f1e5fd9b66a488e2768d7225348
generated_at: 2026-10-14T09:02:31.105837+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/session.ts

## Purpose

Facade layer that exposes the session-lifecycle operations every flow needs (mint, re-mint, snapshot, credential lookup) as stable, strategy-agnostic functions. Controllers call these and never discover which session mode is active — that decision is encapsulated behind `activeStrategy()` in `strategy.ts`.

## Key elements

- **`issueSession`** — Mints a new session for `userId` and sets its credential on `response`. Delegates to `activeStrategy().issue()`. Throws on persistence/signing failure or `SecondFactorRequiredError`.
- **`sessionSnapshotOf`** — Reads the caller's current session metadata (persistence tier, device identity) *before* a destructive change, so a subsequent re-mint can preserve them.
- **`reissueSession`** — Replaces the caller's session while preserving its persistence tier (e.g. "remember me"). Used after reauth or password change.
- **`remintSession`** — Re-mints only the session cookie after a change that revoked *all* sessions (e.g. 2FA factor change). Deliberately never rejects: a failure degrades to "sign in again" rather than reporting the already-completed change as failed.
- **`sessionCredentialOf`** — Returns the credential string naming the caller's own session on this request (what `current` matches, what logout deletes). Returns `undefined` if the caller is authenticated by another mechanism.

## Relationships

- **`strategy.ts`** — Sole implementation target. Every exported function is a one-line delegation to `activeStrategy().<method>()`. This file imports `activeStrategy` and the shared type re-exports (`IssuedSession`, `IssueOptions`, `ReissueOptions`, `SessionRequest`, `SessionSnapshot`) from that module.
- **Controllers** (`post-login`, `post-signup`, `post-2fa-confirm`, `post-login-2fa`, `delete-2fa`, `delete-2fa-method`, `get-oauth-callback`, `post-reauth`, `post-password-change`, `post-logout`) — All import the functions above and are the *only* callers. They pass in an Express `Request`/`Response` pair plus `userId` and options; they never import `strategy.ts` directly.

## Notes

- `remintSession` and `reissueSession` are distinct: `reissueSession` replaces a single session and preserves its persistence tier; `remintSession` runs after a full revocation (all sessions destroyed) and only restores the acting device's cookie.
- `sessionSnapshotOf` must be called **before** the destructive operation (password change, factor change); the snapshot is then passed into `reissueSession` or `remintSession`.
- The local type `SessionCaller` (`SessionRequest & Pick<Request, 'get'>`) is the minimal request shape every function accepts — it is not exported.
- Design intent (stated in the module doc-block): controllers should never branch on session mode. If a controller needs to, that is a boundary violation.
