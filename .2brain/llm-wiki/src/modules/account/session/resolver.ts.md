---
source: src/modules/account/session/resolver.ts
sha256: 1fb42f074b408de6e61de12235d7a01218216ebe9e04b76061bfc7956a002f24
generated_at: 2026-11-08T04:29:54.876319+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/resolver.ts

## Purpose

Provides the account module's concrete `AuthResolver` so the kernel can turn a presented credential (Bearer token or session cookie) into an `AuthContext` for its auth guard. It is a thin delegation layer: every method forwards to whichever session strategy the deployment has activated, keeping the kernel decoupled from account-specific auth logic.

## Key elements

- **`accountAuthResolver: AuthResolver`** — the sole export. Implements the kernel's `AuthResolver` port:
  - `fromBearer` / `fromCookie` — resolve a credential via `activeStrategy()`.
  - `watchCookie` — registers a cookie for change-watching, delegated to the active strategy.
  - `cookieAuthenticates` — pass-through getter on the active strategy.
  - `clearDeadCookie` — calls `destroySessionCookie(response)` to invalidate the session cookie server-side.

## Relationships

- **`src/kernel/authentication.ts`** — supplies the `AuthResolver` interface that `accountAuthResolver` satisfies.
- **`src/modules/account/module.ts`** — registers this resolver with the kernel via `registerAuthResolver` inside its `onRegistered` hook (not at import time).
- **`src/modules/account/session/strategy.ts`** — source of `activeStrategy()`; every credential-resolution method delegates here.
- **`src/modules/account/session/cookies.ts`** — source of `destroySessionCookie`, used by `clearDeadCookie`.
- **`src/modules/account/tests/unit/session-strategy.test.ts`** — exercises the strategy layer that this resolver wraps; failures surface as unresolved credentials or rejections through this file.

## Notes

- Three distinct failure modes are intentionally collapsed at the guard boundary: a *bad credential* (resolves a miss), a *valid credential whose account is gone* (resolves `undefined`), and an *outage* (rejects). The guard returns `401` for the first two to prevent account-existence enumeration; the distinction is preserved only in the internal miss reason for auditing.
- Registration timing matters: `module.ts` installs the resolver in `onRegistered`, so importing this file alone does **not** wire it into the kernel.
