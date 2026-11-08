---
source: tests/support/contract.ts
sha256: 3837c83cce0ec461b1a08b84c69d1524a493425e042266550c75ec90e255d51b
generated_at: 2026-11-08T09:53:23.430155+00:00
model: ollama:qwen3.8:27b
---

# tests/support/contract.ts

## Purpose

Automatic contract-assertion wiring for contract test suites. By monkey-patching `supertest.Test.prototype.then`, it captures every HTTP response a test file receives (including setup calls like logins or seed writes) and validates each one against the `openapi.yaml` schemas in a shared `afterEach`. A single `import '@tests/contract';` is all a contract test file needs—no per-call-site assertions required.

## Key elements

- **`patchSupertestThen()`** (module-level, runs once at import): Reassigns `supertest.Test.prototype.then` so that every resolved `Response` is pushed onto `responsesThisTest` before the caller's `.then` chain sees it. Uses `asStub` to bypass the class-member type on the prototype.
- **`responsesThisTest: Response[]`** (module-local): Accumulates captured responses for the current test; reset in `beforeEach`, judged in `afterEach`.
- **`beforeEach` / `afterEach` hooks**: Clear the capture list before each test; call `assertResponseMatchesContract` on every captured response after each test. A failure attributes to the `it()` block that produced the response.
- **`excludeFromSpecCheck(response)`** (exported): Removes a single already-captured response from the automatic check. Intended for genuine, deliberate spec deviations only—every call site must carry its own explanatory comment.
- **`SupertestThen`** (local type): Restates the `.then` signature inherited from superagent's `RequestBase.prototype.then`, needed because `@types/supertest` exposes it as a class member rather than a reassignable value.

## Relationships

- **Depends on `./response-contract`** — calls `assertResponseMatchesContract` in the `afterEach` loop; that file holds the actual Zod schema validation.
- **Depends on `./stub`** — uses `asStub` to narrow the prototype's `then` property to a reassignable value.
- **Imported by every `*.contract.test.ts` under `src/modules/*/tests/contract/`** (account, addresses, analytics, antibot, api-keys, audit-logs, and others listed as neighbors). They import this file solely for the side-effect hooks; they do not call any of its exports directly.
- **Not used by `tests/fuzz/endpoints.fuzz.test.ts`** — the fuzz suite calls `assertResponseMatchesContract` directly so that `fast-check` can shrink to the minimal failing input; the `afterEach` indirection would defeat that.

## Notes

- The patch is scoped per Jest module registry: each test file gets its own instance of this module, so the prototype patch is installed exactly once per file that imports it and has no cross-file leak.
- `excludeFromSpecCheck` is intentionally rare and requires a paper trail at the call site. `assertResponseMatchesContract` already skips undeclared paths and matches redirects/binary bodies against `zod.unknown()`, so most "edge cases" do not need exclusion.
- The eslint-disable for `unicorn/no-thenable` is deliberate: the file patches an *existing* thenable rather than creating a new one.
- Adding a new contract test file requires only `import '@tests/contract';`—no per-response assertions needed.
