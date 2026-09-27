---
source: tests/unit/kernel/authentication.test.ts
sha256: 9b71294257454baaedfb09c9caa776444a48c82e20eb6846489196ebc68e56ab
generated_at: 2026-09-27T16:11:23.298900+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/authentication.test.ts

## Purpose

Unit test that exercises the "no auth resolver registered" branch of `resolveAccessToken` / `resolveRefreshToken`. It exists as a separate file (rather than a case inside `authorizations.test.ts`) because Jest gives each file its own module registry — here the `@kernel/authentication` module is imported *without* first calling `registerAuthResolver`, which is the one code path the sibling test file cannot reach.

## Key elements

- **`describe` block** — single test suite: *"resolveAccessToken / resolveRefreshToken with no resolver registered"*.
- **Single `it` case** — asserts three things in one test:
  - `resolveAccessToken('any.token.here')` rejects with a plain `Error` (not an `InfrastructureError`).
  - `isInfrastructureError(rejection)` is `false`, confirming guards will **not** translate this into a 503.
  - `resolveRefreshToken('any.token.here')` also rejects (`.rejects.toThrow()`).

## Relationships

- **`src/kernel/authentication.ts`** — the module under test. The test imports `resolveAccessToken` and `resolveRefreshToken` and deliberately does *not* call `registerAuthResolver`, leaving the internal resolver unset.
- **`src/infrastructure/http/errors.ts`** — provides `isInfrastructureError`, used solely to assert the rejection is *not* an infrastructure error (i.e., not the kind of failure that maps to an HTTP 503).

## Notes

- The file's existence is a **module-registry side-effect trick**: importing `@kernel/authentication` here without a prior `registerAuthResolver` call is the only way to reach the "no `account` module in this build" branch, because `authorizations.test.ts` registers a resolver at module load time and cannot un-register it within the same Jest module instance.
- The test uses a single `catch` to capture the rejection object, then asserts on it directly, rather than using `rejects.toBeInstanceOf` — this lets the same rejection be checked with `isInfrastructureError` in the same assertion block.
