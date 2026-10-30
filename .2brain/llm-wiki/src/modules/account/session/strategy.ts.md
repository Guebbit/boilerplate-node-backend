---
source: src/modules/account/session/strategy.ts
sha256: 8033a6ae4ab765f80b452b6a21e78b09d606a76fdb3019a8382840983ac86960
generated_at: 2026-10-29T02:50:13.918395+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/strategy.ts

## Purpose

Defines the **port** (interface) that every session-mode implementation must satisfy, and exposes `activeStrategy` as the single entry point the rest of the codebase uses to mint, resolve, rotate, and list sessions. Callers (login controllers, 2FA handlers, the resolver, SSE streams) never reference a concrete strategy; they call `activeStrategy()` and work against `SessionStrategy`. This is what lets the deployment flip between `jwt` and `cookie` mode without touching application logic.

## Key elements

- **`SessionStrategy` (interface)** — The contract: `issue`, `snapshot`, `reissue`, `remint`, `resolveBearer`, `resolveCookie`, `watchCookie`, `credentialOf`, `list`, plus `mode` and `cookieAuthenticates` discriminators. Both `jwt-strategy.ts` and `cookie-strategy.ts` implement it.
- **`activeStrategy()` (function)** — Reads `getSessionMode()` on every call (not cached) and returns either `jwtStrategy` or `cookieStrategy`.
- **`SESSION_TRANSPORTS` / `SessionTransport`** — The two ways a `cookie`-mode login can hand its credential back to the client: set an HttpOnly cookie (`'cookie'`) or return a `ses_…` id in the body (`'bearer'`). `jwt` mode always sets a refresh cookie and returns an access token; the transport field is ignored.
- **`IssueOptions`** — What a login passes: `remember` tier, `amr` proof array, `provedAt` epoch-ms (becomes OIDC `auth_time`), optional `transport`.
- **`ReissueOptions` / `SessionSnapshot`** — Carried across a session-replacing event (password change, factor change) so the new session inherits the old one's persistence tier, family id, timestamps, and device label.
- **`IssuedSession`** — The wire-level credential fields a login or re-mint response carries: `token` (JWT access) and/or `sessionToken` (`ses_…` id).
- **`SessionRequest`** — A `Pick<Request, 'cookies' | 'headers' | 'sessionVia'>` slice so strategies don't need the full Express request.

## Relationships

- **`./config.ts`** — `activeStrategy` calls `getSessionMode()` each invocation to pick the implementation.
- **`./jwt-strategy.ts` / `./cookie-strategy.ts`** — The two concrete `SessionStrategy` implementations returned by `activeStrategy`.
- **`../session-mode.ts`** — Provides the `SessionMode` type used in the strategy's `mode` discriminator.
- **`@kernel/authentication`** — Contributes the `Resolution` and `StreamWatch` types used in the `resolve*` and `watchCookie` return signatures.
- **Controllers (`post-login`, `post-2fa-confirm`, `post-2fa-disable`, `post-2fa-method-remove`, `post-password-change`)** — All obtain a strategy via `activeStrategy()` and call `issue`, `reissue`, `remint`, or `snapshot`; none import a concrete strategy.
- **`./resolver.ts`** — Uses `activeStrategy().resolveBearer` / `resolveCookie` / `watchCookie` to authenticate incoming requests and SSE streams.
- **`services/sessions.ts`** — Calls `activeStrategy().list` / `credentialOf` for the account session-list endpoint.
- **`tests/factories.ts`** — Imports the `SessionStrategy` interface (and related types) to build mock strategies in unit tests.

## Notes

- `activeStrategy` is a **function**, not a const: it re-reads the mode on every call so a test that mutates the config (or a process restart with a different `NODE_SESSION_MODE`) is picked up without a stale import-time binding.
- `remint` **never rejects**: the destructive change (e.g. factor removal) already committed, so a failed re-mint resolves to an empty `IssuedSession` `{}` rather than erroring. Callers must tolerate that.
- `provedAt` is the epoch-ms at which the proof *began* (before hash lookup, OTP check, or OAuth exchange). The mint rejects it if the account's epoch has since advanced (`StaleProofError`).
- `watchCookie` is distinct from `resolveCookie`: it is used by SSE streams and preserves the session *family* across rotations/re-proofs, whereas `resolveCookie` is a one-shot check.
- A session row's `mode` field is set at issue time; a row issued under `jwt` cannot be resolved under `cookie` or vice-versa. Switching `NODE_SESSION_MODE` signs out every existing session.
