---
source: tests/unit/kernel/authentication.test.ts
sha256: 6e1a961eeaa7d4a83dc1cc11969d06bfe7d3d6601dd1ecf13a642d1989f2a4c9
generated_at: 2026-10-15T13:21:32.330768+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/authentication.test.ts

## Purpose

Exercises the "no auth resolver registered" branch of the authentication kernel — the one path that `authorizations.test.ts` cannot reach because that file calls `registerAuthResolver` at module load. Jest's per-file module registry makes this separation possible: importing `@kernel/authentication` here without registering a resolver leaves the module in its default (no-account) state.

## Key elements

- **`describe` block** — `"resolveBearer / resolveCookie with no resolver registered"`; two test cases covering the two public behaviors of that branch.
- **Test 1** (`rejects the way a bad token does…`) — asserts `resolveBearer` rejects with a plain `Error` that is **not** an `InfrastructureError`, and that `resolveCookie` also rejects (throws).
- **Test 2** (`says the cookie authenticates nothing…`) — asserts `cookieAuthenticatesRequests()` returns `false` without throwing, since `getAuth` invokes it on every cookie-carrying request.

## Relationships

- **`src/kernel/authentication.ts`** — the module under test. Imports `resolveBearer`, `resolveCookie`, and `cookieAuthenticatesRequests`. Deliberately does **not** call `registerAuthResolver`, leaving the kernel in its no-account state.
- **`src/infrastructure/http/errors.ts`** — imports `isInfrastructureError` solely to assert the rejection is *not* that type, guarding against a misclassification that would cause guards to answer 503 instead of a 401-class failure.

## Notes

- This file must stay separate from `authorizations.test.ts`. Merging them would cause `registerAuthResolver` (called at that file's module-load time) to alter the module state, and the no-resolver branch would never be exercised.
- The critical contract: the no-resolver path must surface a plain `Error`, never an `InfrastructureError`. An infrastructure error would make HTTP guards respond 503 (outage semantics), which is incorrect for "this build has no account module" (authentication-failure semantics).
- `cookieAuthenticatesRequests()` is tested as a return value (`false`), not a throw, because it sits on a hot path invoked per-request by `getAuth`.
