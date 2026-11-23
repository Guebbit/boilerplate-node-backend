---
source: src/modules/account/session/resolver.ts
source_sha256: 8a854b5ff77a731b07426df4fb9091fcdfd612593f9b1117cf88517268e731ab
context_sha256: d79ca269459980c245a69910cdf14b67daa7ce075f692853860725550f4418d0
generated_at: 2026-11-22T03:48:39.283825+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/resolver.ts

## Purpose
Defines `accountAuthResolver`, the account module's implementation of the kernel's `AuthResolver` port ("who is making this request"). It turns a presented bearer token or cookie into the `AuthContext` a guard checks, delegating all credential meaning to whichever session strategy the deployment runs.

## Key elements
- `accountAuthResolver: AuthResolver`: the only export, a thin object that forwards to the active strategy:
  - `fromBearer(token, options)` calls `activeStrategy().resolveBearer(...)`.
  - `fromCookie(token, options)` calls `activeStrategy().resolveCookie(...)`.
  - `watchCookie(token)` calls `activeStrategy().watchCookie(...)`.
  - `cookieAuthenticates()` returns the active strategy's `cookieAuthenticates` flag.
  - `clearDeadCookie(response)` calls `destroySessionCookie(response)` directly, without going through the strategy.

## Relationships
- `src/kernel/authentication.ts`: supplies the `AuthResolver` type this object implements.
- `src/modules/account/module.ts`: installs `accountAuthResolver` through `registerAuthResolver` in its `onRegistered` hook, not at import time.
- `src/modules/account/session/strategy.ts`: provides `activeStrategy()`. Every strategy lookup happens at call time, so the strategy is chosen per call rather than fixed when the module loads.
- `src/modules/account/session/cookies.ts`: provides `destroySessionCookie`, used by `clearDeadCookie`.
- `src/modules/account/tests/unit/session-strategy.test.ts`: a neighbor in the dependency graph. The file does not show how it is used there.

## Notes
- The doc comment distinguishes three failure outcomes. A bad credential resolves a miss. A valid credential whose user no longer exists resolves `undefined`. An outage rejects.
- The guard answers the first two with the same `401`, so callers cannot tell whether an account exists. The distinction survives only in the miss reason the guard counts and audits.
- Related docs: the file's `@see` points to the "choosing the session mode" section; the session mode itself is defined in `src/modules/account/session-mode.ts`. The proof semantics in `./auth-context` are shared across strategies.
