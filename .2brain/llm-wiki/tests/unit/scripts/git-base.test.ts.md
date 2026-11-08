---
source: tests/unit/scripts/git-base.test.ts
sha256: e77fb3155658e1625b47028551adabb1b819751bfa9c29c07dbe9a340b965728
generated_at: 2026-11-08T10:37:31.637974+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/git-base.test.ts

## Purpose

Unit tests for the `mergeBase` ref resolver (defined in `scripts/git-base.ts`). This resolver is the shared base-ref lookup that both `check-asyncapi-breaking.ts` and `mutation/run-diff.ts` call before diffing. The tests verify the resolution order, fallback logic, and failure paths without touching a real git repository.

## Key elements

- **`describe('mergeBase')`** — single test suite covering four scenarios:
  - *Direct hit:* the requested ref (e.g. `origin/main`) resolves on the first call; resolver invoked exactly once.
  - *Fallback:* `origin/main` fails, resolver is then called with `origin/HEAD` and succeeds.
  - *No match:* neither ref resolves → returns `undefined` and logs a message containing the script name.
  - *Explicit `--base` failure:* a non-default ref (e.g. `HEAD~3`) that fails → calls `process.exit(2)` immediately **without** attempting the `origin/HEAD` fallback.

## Relationships

- **`scripts/git-base.ts`** (sole import): exports `mergeBase(defaultBase, scriptName, resolve)`. All assertions target this function's behavior.
- The doc-comment notes two downstream consumers (`check-asyncapi-breaking.ts`, `mutation/run-diff.ts`) that rely on the same resolution contract this file pins down.

## Notes

- **`process.exit` mocking pattern:** `jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit') })` — the throw is what actually halts execution so the assertion can verify the fallback branch was *not* reached. A plain no-op mock would let the function continue past the exit call.
- **Resolver injection:** the third argument to `mergeBase` is a `(ref: string) => string | undefined` callback, fully controlled by the test. No `child_process` or real git is ever invoked.
- **Console spies:** the "skip" and "explicit failure" cases spy on `console.log` / `console.error` respectively and restore them in the same test (no `afterEach`). Forgetting the restore would leak the mock into subsequent tests.
