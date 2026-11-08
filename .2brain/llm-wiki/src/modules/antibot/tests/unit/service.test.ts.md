---
source: src/modules/antibot/tests/unit/service.test.ts
sha256: 762e35a04379ca233d0c4e961b8f36826141a4e0dc7da26c6e8e5ed3295e9ff8
generated_at: 2026-11-08T05:01:06.606076+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/tests/unit/service.test.ts

## Purpose

Unit test verifying that `antibotService.config` signals a misconfigured provider via promise rejection rather than a synchronous throw, ensuring the controller's `.catch` chain can intercept the error.

## Key elements

- **`describe('antibotService.config')`** — single test suite; no other cases exist in this file.
- **`it('rejects, rather than throws, …')`** — the sole test case. Wraps the call in `withEnvironmentOverrides({ NODE_ANTIBOT_PROVIDER: 'no-such-provider' }, …)`, asserts the invocation itself does **not** throw, then asserts the returned promise rejects with a message matching `/NODE_ANTIBOT_PROVIDER|no-such-provider/`.
- **Module-level JSDoc** — documents *why* the rejection contract matters (the controller chains `.catch` and would miss a synchronous throw).

## Relationships

- **`src/modules/antibot/service.ts`** — the SUT; this file imports `antibotService` and exercises only its `.config` method.
- **`tests/support/environment.ts`** — provides `withEnvironmentOverrides`, a helper that temporarily patches process environment variables for the duration of the callback and restores them afterwards.

## Notes

- The import alias `@tests/environment` maps to `tests/support/environment.ts` (not the colocated `src/modules/antibot/tests/` path); the graph neighbor listed as `tests/support/environment.ts` confirms this.
- The test captures the promise in a `pending` variable before awaiting it, specifically to separate the "does it throw synchronously?" assertion from the "does it reject?" assertion.
- Only one provider-misconfiguration path is covered here; other branches of `config` (e.g., valid provider, missing env var entirely) are not tested in this file.
