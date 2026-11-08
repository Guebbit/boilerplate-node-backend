---
source: src/modules/account/session/strategy.ts
sha256: 8033a6ae4ab765f80b452b6a21e78b09d606a76fdb3019a8382840983ac86960
generated_at: 2026-11-08T04:30:28.674368+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/strategy.ts

## Purpose

Defines the `SessionStrategy` interface — the single port through which every consumer (login, 2FA, reauth, the resolver) interacts with session management without knowing whether the deployment runs in `jwt` or `cookie` mode. It also exports `activeStrategy()`, the factory that returns the concrete strategy chosen at runtime from `NODE_SESSION_MODE`.

## Key elements

- **`SessionStrategy`** (interface) — The port. Methods: `issue`, `snapshot`, `reissue`, `remint`, `resolveBearer`, `resolveCookie`, `watchCookie`, `credentialOf`, `list`. Properties: `mode`, `cookieAuthenticates`.
- **`activeStrategy()`** — Returns `cookieStrategy` or `jwtStrategy` based on the current `getSessionMode()` value. Called per-invocation, not memoized, so a config change is honoured immediately.
- **`SESSION_TRANSPORTS`** — `['cookie', 'bearer']` const tuple; the only transports a login may request. `jwt` mode ignores this (always sets a refresh cookie + access token).
- **`SessionRequest`** — Narrow `Pick<Request, 'cookies' | 'headers' | 'sessionVia'>` shape passed to strategy methods instead of the full Express request.
- **`IssueOptions`** — `remember`, `amr`, `provedAt`, optional `transport`. The `provedAt` field is the epoch-ms when the proof check *began* and becomes OIDC `auth_time`.
- **`SessionSnapshot`** — Captured before a destructive change (password change, factor removal) so `remint` can preserve tier, family, and device info.
- **`IssuedSession`** — Wire shape of a login/step-up response: optional `token` (JWT) and/or `sessionToken` (`ses_…` id).
- **`ReissueOptions`** — `amr` + optional `snapshot` for `reissue`/`remint`.

## Relationships

- **`./cookie-strategy.ts` / `./jwt-strategy.ts`** — The two concrete adapters implementing `SessionStrategy`. This file is the only place that references both and selects between them.
- **`./config.ts`** — Supplies `getSessionMode()`, which `activeStrategy()` calls on every invocation.
- **`../session-mode.ts`** — Provides the `SessionMode` type used on the `mode` property.
- **`src/kernel/authentication.ts`** — Source of the `Resolution<T>` and `StreamWatch` types that the strategy's resolve/watch methods return.
- **`src/modules/account/controllers/post-login.ts`** — Primary caller of `activeStrategy().issue()`.
- **`src/modules/account/controllers/post-password-change.ts`**, **`post-2fa-confirm.ts`**, **`post-2fa-disable.ts`**, **`post-2fa-method-remove.ts`** — Call `snapshot()` then `remint()` (or `reissue()`) after the change has already committed.
- **`src/modules/account/session/resolver.ts`** — Calls `resolveBearer` / `resolveCookie` / `watchCookie` to authenticate incoming requests.
- **`src/modules/account/services/sessions.ts`** — Calls `list()` and `credentialOf()` for the account's live-session view.

## Notes

- **Mode is immutable per row.** A session row's `mode` field is set at issue time and never migrated; switching `NODE_SESSION_MODE` invalidates all existing sessions. There is no cross-mode resolution path.
- **`remint` never throws to the caller's HTTP response.** The destructive change has already committed, so a failed re-mint resolves to an empty `IssuedSession` rather than rejecting the request.
- **`provedAt` is a staleness guard.** The mint compares it against the account's current epoch; if the epoch moved after `provedAt`, a `StaleProofError` is thrown. This is the mechanism that prevents a captured token from surviving a password or factor change.
- **`SESSION_TRANSPORTS` is only meaningful in `cookie` mode.** In `jwt` mode the strategy always sets a refresh cookie and returns an access token regardless of the `transport` field.
- **`activeStrategy()` is intentionally not cached.** A test or hot-restart that flips `NODE_SESSION_MODE` takes effect on the very next call without a process restart.
