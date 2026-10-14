---
source: src/modules/account/session/strategy.ts
sha256: 532ff9803d652d8e6726e17d671d4fc0700794acce47ac3208594b6f2ec87f2f
generated_at: 2026-10-14T09:02:51.627300+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/strategy.ts

## Purpose

Defines the **port** (the `SessionStrategy` interface) and the **factory** (`activeStrategy`) that let all session-facing code—login, 2FA, password change, the auth resolver—interact with whichever session backend (`jwt` or `cookie`) is active without knowing which one it is. It is the seam between the business logic above and the two adapter implementations below.

## Key elements

- **`SessionStrategy`** (interface) — the port. Methods: `issue`, `snapshot`, `reissue`, `remint`, `resolveBearer`, `resolveCookie`, `credentialOf`, `list`; plus read-only properties `mode` and `cookieAuthenticates`.
- **`activeStrategy()`** — returns `cookieStrategy` or `jwtStrategy` based on `getSessionMode()` at call time (not import time), so a runtime mode change is honoured.
- **`SessionRequest`** — the minimal Express request slice a strategy reads (`cookies`, `headers`, `sessionVia`).
- **`SESSION_TRANSPORTS`** / **`SessionTransport`** — `'cookie' | 'bearer'`, controlling where the credential lands on a cookie-mode login.
- **`IssueOptions`** — parameters for `issue`: `remember` tier, `amr` proof array, `transport`.
- **`SessionSnapshot`** — fields captured from a session *before* a destructive change so `reissue`/`remint` can carry them forward.
- **`IssuedSession`** — the credential fields returned after `issue`/`reissue` (`token`, `sessionToken`).
- **`ReissueOptions`** — `amr` + optional `snapshot` for `reissue`/`remint`.

## Relationships

- **`./config.ts`** — provides `getSessionMode()` and the `RefreshTokenExpiryTime` type; `activeStrategy` calls it on every invocation.
- **`./jwt-strategy.ts`** / **`./cookie-strategy.ts`** — the two adapters that implement `SessionStrategy`; imported here as singletons (`jwtStrategy`, `cookieStrategy`).
- **`../session-mode.ts`** — supplies the `SessionMode` type used on `SessionStrategy.mode`.
- **`src/kernel/authentication.ts`** — supplies the `Resolution` type used in the return signatures of `resolveBearer` and `resolveCookie`.
- **Controllers (`post-login`, `post-2fa-confirm`, `post-password-change`, `delete-2fa`, `delete-2fa-method`)** — call `activeStrategy()` and then the relevant lifecycle method (`issue`, `reissue`, `remint`).
- **`session/resolver.ts`** — calls `resolveBearer` / `resolveCookie` / `credentialOf` to authenticate incoming requests.
- **`services/sessions.ts`** — calls `list` to build the account's session list.
- **`tests/factories.ts`** / **`tests/integration/auth-storage.test.ts`** — construct or assert against the types and the `activeStrategy` output.

## Notes

- `activeStrategy` is a **function**, not a frozen export—call it at the point of use. Tests that flip `NODE_SESSION_MODE` at runtime rely on this.
- A session row is always bound to the mode that created it; switching modes signs every user out. There is no cross-mode migration path.
- `remint` is explicitly "never fails the response"—the destructive change (e.g., 2FA factor deletion) has already committed; `remint` only re-establishes the caller's own cookie.
- `snapshot` must be captured **before** calling `reissue`/`remint` if the operation deletes the session, otherwise the persistence tier and device info are lost.
