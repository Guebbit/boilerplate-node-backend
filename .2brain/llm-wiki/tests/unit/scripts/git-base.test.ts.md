---
source: tests/unit/scripts/git-base.test.ts
sha256: e77fb3155658e1625b47028551adabb1b819751bfa9c29c07dbe9a340b965728
generated_at: 2026-09-27T16:13:43.846319+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/git-base.test.ts

## Purpose
Unit tests for the `mergeBase` ref-resolver in `scripts/git-base.ts`, covering its resolution order, fallback logic, and error paths. The resolver function is injected rather than calling real git, so the suite runs hermetically.

## Key elements
- **`describe('mergeBase')`** — single describe block containing four `it` cases:
  - *Direct resolution* — when the requested ref (e.g. `origin/main`) resolves on the first call, it is returned immediately and `resolve` is called exactly once.
  - *Fallback to `origin/HEAD`* — when `origin/main` does not resolve, the function tries `origin/HEAD` as a second candidate.
  - *Both fail → `undefined`* — when neither ref resolves, `mergeBase` returns `undefined` and logs a message that includes the script name passed as the second argument.
  - *Explicit `--base` failure → `process.exit(2)`* — when a non-default ref (e.g. `HEAD~3`) is requested and fails to resolve, the function calls `process.exit(2)` without attempting the `origin/HEAD` fallback.

## Relationships
- **`scripts/git-base.ts`** — the module under test; `mergeBase` is imported and exercised in every case. No other files are imported or referenced by the test.

## Notes
- `process.exit` is mocked by replacing it with a function that **throws**, which both records the call and prevents the test process from actually terminating. The test asserts the thrown message rather than using `expect(process.exit).toHaveBeenCalled()` alone.
- The "explicit `--base`" test distinguishes an operator-supplied ref (anything other than the default `origin/main`) from the implicit fallback path; only the explicit path triggers a hard exit.
- `console.log` / `console.error` are spied on and restored after each relevant test to keep stdout clean and avoid cross-test leakage.
