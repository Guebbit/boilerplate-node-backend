---
source: tests/support/eventually.ts
sha256: 287e2c4ea32938ef295cf493b5a7dcbfbbc11e2d48e61a5d3c32fa10db450d60
generated_at: 2026-10-15T12:58:01.436576+00:00
model: ollama:qwen3.8:27b
---

# tests/support/eventually.ts

## Purpose

A test-support utility for waiting on side effects that the code under test deliberately does not await (e.g. detached mail enqueues, fire-and-forget notices). It polls a condition at fixed intervals instead of sleeping a fixed duration, so fast machines return immediately while slow ones still have the full window.

## Key elements

- **`eventually(done: () => boolean, windowMs?: number): Promise<void>`** — The sole export. Polls `done` every 20 ms until it returns `true` or `windowMs` (default 2000) elapses. Resolves silently in either case; it never throws or rejects.

## Relationships

- Consumed by integration and contract tests that assert on asynchronous, non-awaited side effects:
  - `src/modules/account/tests/contract/lifecycle.contract.test.ts`
  - `src/modules/account/tests/integration/reset-request-timing.test.ts`
  - `src/modules/api-keys/tests/integration/activity.test.ts`
  - `tests/cross-cutting/contract-search-parity.test.ts`

  Each caller passes a predicate (or relies on the default window) and then immediately issues the real assertion, which is expected to fail with a meaningful message if the condition never became true.

## Notes

- **Never throws.** By design, the timeout path resolves the same way the success path does. The assertion written *after* the `await eventually(...)` call is the one that should fail, carrying a test-specific message. An opaque "timed out" error from this helper would be strictly less useful.
- Poll interval is hard-coded to 20 ms; only the window is parameterised.
- The module is annotated `@module` and has no default export—import the named `eventually` binding.
