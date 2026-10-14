---
source: src/modules/account/session/resolver.ts
sha256: 455151b4fedd41e3712b953cdb670933756a9366fcf356725eace6fad93b4664
generated_at: 2026-10-14T14:39:42.452238+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/resolver.ts

## Purpose

Adapts the kernel's `AuthResolver` port to the account module's active session strategy. It is the single registration point that turns a presented credential (bearer token or cookie) into an `AuthContext` for guard checks, keeping the kernel strategy-agnostic.

## Key elements

- **`accountAuthResolver: AuthResolver`** — The sole export. A plain object with three members, each a one-line delegation to `activeStrategy()` from `./strategy`:
  - `fromBearer(token)` → `activeStrategy().resolveBearer(token)`
  - `fromCookie(token)` → `activeStrategy().resolveCookie(token)`
  - `cookieAuthenticates()` → `activeStrategy().cookieAuthenticates` (note: property access, not a call)

## Relationships

- **`src/kernel/authentication.ts`** — Supplies the `AuthResolver` type that this object must satisfy.
- **`src/modules/account/session/strategy.ts`** — Source of `activeStrategy()`, the runtime strategy every call in this file delegates to.
- **`src/modules/account/module.ts`** — Registers `accountAuthResolver` with the kernel via `registerAuthResolver` inside its `onRegistered` lifecycle hook.
- **`src/modules/account/tests/unit/session-strategy.test.ts`** — Exercises the strategy layer this resolver fronts; it does not import this file directly.

## Notes

- **Three distinct failure outcomes, two visible to the caller:** a bad credential resolves a *miss*, a valid credential for a deleted user resolves `undefined`, and an outage *rejects*. The guard maps the first two to the same `401` so account existence is never leaked; the internal distinction is preserved only in the miss reason the guard counts and audits.
- **Registration timing:** `accountAuthResolver` is wired up in `onRegistered`, not at import time—deliberately deferred so the strategy can be activated before the resolver is reachable.
- **`cookieAuthenticates` is a getter delegation** (no parentheses), unlike the other two members which are function calls.
