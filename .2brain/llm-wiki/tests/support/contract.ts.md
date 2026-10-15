---
source: tests/support/contract.ts
sha256: 3837c83cce0ec461b1a08b84c69d1524a493425e042266550c75ec90e255d51b
generated_at: 2026-10-15T12:57:09.430290+00:00
model: ollama:qwen3.8:27b
---

# tests/support/contract.ts

## Purpose
Automatic contract-assertion wiring for contract test suites. By monkey-patching `supertest.Test.prototype.then`, it captures every HTTP response a test receives (including incidental setup calls like logins or seed writes) and validates them against the Orval-generated OpenAPI Zod schemas in a single shared `afterEach`. The only required usage is a bare side-effect import: `import '@tests/contract'`.

## Key elements
- **`excludeFromSpecCheck(response)`** – Removes one already-captured response from the automatic check. Intended only for deliberate, documented spec deviations; never for tooling gaps (those are handled upstream by `assertResponseMatchesContract`).
- **`patchSupertestThen()`** – Monkey-patches `supertest.Test.prototype.then` so every resolved response is pushed into `responsesThisTest` before the caller's `.then` fires. Called once at module load.
- **`SupertestThen`** (type) – Restates the signature of superagent's `RequestBase.prototype.then` so the patch can be typed without referencing an inaccessible class-member type.
- **`beforeEach` / `afterEach` hooks** – Reset the captured-response array per test, then iterate it calling `assertResponseMatchesContract` on each. A failure attributes to whichever `it()` produced the response.
- **Module-level side effect** – `patchSupertestThen()` is invoked at import time; no other export is consumed by call sites.

## Relationships
- **Imports** `asStub` from `./stub` (type-narrowing seam for the prototype patch) and `assertResponseMatchesContract` from `./response-contract` (the actual OpenAPI schema judge).
- **Imported by** every `*.contract.test.ts` file across modules (account, addresses, analytics, antibot, api-keys, audit-logs, cart, delivery, example, etc.) solely for its side effects.
- **Not imported by** the fuzz suite (`tests/fuzz/endpoints.fuzz.test.ts`), which calls `assertResponseMatchesContract` directly inside `fast-check`'s property function so mismatches shrink to minimal inputs.
- **Upstream of validation:** the schemas it checks against are generated from `openapi.yaml` via `orval.config.ts`; this file only wires the *when* of the check, not the *what*.

## Notes
- The patch targets a shared prototype, but Jest's per-file module registry means each test file that imports this gets its own patched instance; files that don't import it are unaffected.
- `excludeFromSpecCheck` is deliberately scarce—every use must carry its own explanatory comment at the call site, since the design goal is that no call site can silently opt out.
- An `eslint-disable-next-line unicorn/no-thenable` is present at the patch site because the rule targets *creating* new thenables, whereas this intentionally reassigns an existing one.
- `assertResponseMatchesContract` already skips undeclared paths and matches redirects / binary bodies against `zod.unknown()`, so those are not "deviations" that need `excludeFromSpecCheck`.
