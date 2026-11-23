---
source: src/modules/antibot/tests/unit/service.test.ts
source_sha256: 762e35a04379ca233d0c4e961b8f36826141a4e0dc7da26c6e8e5ed3295e9ff8
context_sha256: c00bc65de8fb8b2b0abb155c8788cb94102c4f5213f75a59a07e0a9caad8582a
generated_at: 2026-11-22T04:20:07.185736+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/antibot/tests/unit/service.test.ts

## Purpose
Unit test for `antibotService.config`. It pins down the contract that a misconfigured antibot provider is reported by returning a rejected promise, not by throwing synchronously. The reason, per the file's module doc, is that the controller chains `.catch` on the returned promise and would not see a synchronous throw.

## Key elements
- `describe('antibotService.config')`: the only suite in the file.
- Single test, "rejects, rather than throws, when the provider named is not one this build has":
  - Sets `NODE_ANTIBOT_PROVIDER` to `'no-such-provider'` through `withEnvironmentOverrides`.
  - Calls `antibotService.config()` inside `expect(...).not.toThrow()`, which asserts there is no synchronous throw, and stores the returned promise.
  - Asserts that the promise rejects with an error whose message matches `/NODE_ANTIBOT_PROVIDER|no-such-provider/`.

## Relationships
- `src/modules/antibot/service.ts`: provides `antibotService`, the unit under test. The test only calls its `config()` method.
- `tests/support/environment.ts`: provides `withEnvironmentOverrides`, imported through the `@tests/environment` alias. It scopes the temporary `NODE_ANTIBOT_PROVIDER` value to the callback.

## Notes
- The test returns the `expect(...).rejects` assertion from the callback, and returns the `withEnvironmentOverrides` result from the `it`. That means the environment override has to stay in place until the promise settles, which only works if `withEnvironmentOverrides` awaits the callback's return value. This is assumed from the code, not confirmed in `environment.ts`.
- The error-message regex accepts either the env var name or the bad provider value, so the exact wording of the error is not pinned.
