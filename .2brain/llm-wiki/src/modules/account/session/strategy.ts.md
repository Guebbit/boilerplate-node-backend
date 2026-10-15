---
source: src/modules/account/session/strategy.ts
sha256: 872ad2ae34ec99f7fef4a7bfb788ac85af427ee04e0469c0b57d330a51f1a04d
generated_at: 2026-10-15T10:09:00.291225+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/strategy.ts

## Purpose

Defines the **port** (the `SessionStrategy` interface) through which all higher-level code mints, resolves, and manages user sessions, without needing to know whether the deployment uses JWT or cookie mode. The single entry point is `activeStrategy()`, which returns the concrete adapter selected at process start via `NODE_SESSION_MODE`. Every caller (login, 2FA, reauth, password change, resolver) goes through this one function.

## Key elements

- **`activeStrategy(): SessionStrategy`** — Returns `cookieStrategy` or `jwtStrategy` based on `getSessionMode()`. Read per call so a config change (test, restart) is honoured immediately.
- **`SessionStrategy` interface** — The port. Methods:
  - `issue` — Mint a session at login; sets credential on the response; enforces 2FA (`amr`) and stale-proof (`provedAt`) checks.
  - `snapshot` — Capture the caller's current session fields (tier, family, device, expiry) *before* a destructive change, so `remint` can preserve them.
  - `reissue` — Replace the caller's session after a step-up (reauth, password change).
  - `remint` — Re-mint after an event that killed *all* sessions (e.g. 2FA change); never fails the response.
  - `resolveBearer` / `resolveCookie` — Validate a token or cookie and return a `Resolution<AuthContext>`.
  - `watchCookie` — Resolve an SSE-stream cookie and pin its session family across rotations.
  - `credentialOf` — Return the raw credential (cookie value or `ses_…` id) the caller presents on this request.
  - `list` — Return the account's live sessions, marking the caller's own.
- **`SessionRequest`** — Minimal Express request slice a strategy reads (`cookies`, `headers`, `sessionVia`).
- **`SESSION_TRANSPORTS` / `SessionTransport`** — `'cookie' | 'bearer'`; controls how `issue` delivers the credential.
- **`IssueOptions`** — `remember`, `amr`, `provedAt`, optional `transport`.
- **`SessionSnapshot`** — Fields carried from the old session into `remint`.
- **`IssuedSession`** — Response shape: optional `token` (JWT) or `sessionToken` (`ses_…` bearer id).
- **`ReissueOptions`** — `amr` + optional `snapshot`.

## Relationships

- **`./cookie-strategy.ts`** & **`./jwt-strategy.ts`** — The two adapter implementations returned by `activeStrategy()`.
- **`./config.ts`** — Provides `getSessionMode()` and the `RefreshTokenExpiryTime` type used in `IssueOptions`/`SessionSnapshot`.
- **`../session-mode.ts`** — Supplies the `SessionMode` type that `SessionStrategy.mode` and the mode comparison rely on.
- **`src/kernel/authentication.ts`** — Source of the `Resolution` and `StreamWatch` types used in the interface's resolve/watch signatures.
- **Controllers** (`post-login`, `post-2fa-confirm`, `post-password-change`, `delete-2fa`, `delete-2fa-method`) — Call `activeStrategy().issue()`, `.reissue()`, or `.remint()` to mint/replace sessions.
- **`./resolver.ts`** — Calls `activeStrategy().resolveBearer()` / `.resolveCookie()` to authenticate incoming requests.
- **`../services/sessions.ts`** — Calls `activeStrategy().list()` and `.credentialOf()` for the session-management UI.
- **`tests/factories.ts`** — Constructs `SessionRequest` / `IssueOptions` fixtures for strategy tests.

## Notes

- `activeStrategy()` is intentionally **not** frozen at import time; it re-reads `getSessionMode()` on every call so tests or hot-reloads that flip the mode take effect without a restart.
- A session row always belongs to the mode that issued it. Switching `NODE_SESSION_MODE` signs everyone out because the other adapter won't recognise the rows.
- `remint` must **never** throw into the HTTP response: the destructive change (e.g. 2FA deletion) has already committed, so a failed re-mint returns an empty `IssuedSession` rather than an error.
- `provedAt` is captured *before* the password/OTP/OAuth check begins; the mint compares it against the account's epoch to reject stale proofs.
