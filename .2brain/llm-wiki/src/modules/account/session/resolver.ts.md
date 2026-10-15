---
source: src/modules/account/session/resolver.ts
sha256: 1fb42f074b408de6e61de12235d7a01218216ebe9e04b76061bfc7956a002f24
generated_at: 2026-10-15T10:08:27.761016+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/resolver.ts

## Purpose

Implements the kernel's `AuthResolver` port for the account module. It is a thin delegation layer that forwards every credential-resolution call to whichever session strategy the deployment has activated, and is registered by `module.ts` so the kernel's auth guard can identify callers.

## Key elements

- **`accountAuthResolver: AuthResolver`** (exported) — the sole export; a plain object satisfying the kernel interface.
  - `fromBearer(token, options)` → delegates to `activeStrategy().resolveBearer()`
  - `fromCookie(token, options)` → delegates to `activeStrategy().resolveCookie()`
  - `watchCookie(token)` → delegates to `activeStrategy().watchCookie()`
  - `cookieAuthenticates` → delegates to `activeStrategy().cookieAuthenticates`
  - `clearDeadCookie(response)` → calls `destroySessionCookie(response)` directly (not routed through the strategy)

## Relationships

- **`src/kernel/authentication.ts`** — provides the `AuthResolver` type that this object satisfies.
- **`src/modules/account/module.ts`** — registers `accountAuthResolver` via `registerAuthResolver` inside its `onRegistered` lifecycle hook.
- **`src/modules/account/session/strategy.ts`** — source of `activeStrategy()`, the concrete resolver this file delegates all credential logic to.
- **`src/modules/account/session/cookies.ts`** — source of `destroySessionCookie`, used by `clearDeadCookie`.
- **`src/modules/account/tests/unit/session-strategy.test.ts`** — exercises the strategy that this resolver forwards to.

## Notes

- **Two distinct failure modes, one HTTP response.** A *bad credential* resolves to a "miss"; a *valid credential whose user has been deleted* resolves to `undefined`. The guard returns `401` for both, but the resolver's miss reason is what the guard counts and audits — the distinction is invisible to the caller.
- **`clearDeadCookie` is the only method that does not delegate to the strategy.** It unconditionally calls `destroySessionCookie`, so its behavior is independent of which strategy is active.
- Registration is deferred to the `onRegistered` hook (not import time) so the resolver is only live after the module has fully initialised its strategy.
