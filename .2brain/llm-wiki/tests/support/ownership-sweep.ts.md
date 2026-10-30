---
source: tests/support/ownership-sweep.ts
sha256: 6450f81cd8e3133bef6b16d74252dd7b1e54b3ff99c966dbb4360c04de4bd627
generated_at: 2026-10-29T07:09:29.459329+00:00
model: ollama:qwen3.8:27b
---

# tests/support/ownership-sweep.ts

## Purpose

Shared harness for ownership-sweep tests. It drives a "customer B" request at both a foreign customer's ID and a non-existent ID, then asserts the two responses are indistinguishable in shape and match the contract-documented answer. This proves the server refuses foreign IDs without leaking them. Both ownership contract test suites consume this module so they share identical pass/fail logic.

## Key elements

- **`Verb`** — union of HTTP methods (`GET | POST | PUT | PATCH | DELETE`) accepted by `Attempt`.
- **`Attempt`** — describes one request: method, path, bearer token, optional query/body.
- **`DocumentedAnswer`** — the contract's expected response for a foreign ID (status, optional error code, optional `emptyPage` flag, optional `without` substring that must not leak).
- **`OwnedCase`** — one test case: key label, expected answer, `aim(foreign)` factory, optional `prepare`, optional `control` + `controlPassed` for a positive-control request.
- **`send`** (exported) — dispatches an `Attempt` through the real supertest agent (`api()` from `./http`) and returns the `Response`.
- **`judge`** (exported) — runs one `OwnedCase`: prepares, captures a "before" snapshot via `watch()`, fires the foreign and missing requests, compares shapes/status/code/leak/mutation, optionally fires the control. Returns `string[]` of problems (empty array = pass).
- **`shapeOf`** (module-private) — serialises `{status, errors, items}` for the parity comparison.

## Relationships

- **`tests/support/http.ts`** — provides the `api` factory (supertest agent). `send` calls `api()[verb](path)` to issue real requests.
- **`tests/contract/ownership-contract.test.ts`** — imports `judge` and the type definitions to build and execute its set of `OwnedCase` instances.
- **`tests/contract/ownership-shop.contract.test.ts`** — same consumer relationship; supplies shop-specific cases to `judge`.

## Notes

- A **422** on either the foreign or missing request is always a hard failure — it means the request was rejected before reaching the ownership lookup.
- `judge` does **not** throw; it accumulates human-readable strings and returns them. Callers are responsible for asserting the array is empty.
- `control` is optional. For path-parameter routes the 404 on a missing ID already pins the answer, so a separate positive control is unnecessary.
- `emptyPage: true` means the contract expects **200 with `items: []`**, not a 404.
- The `without` field is a coarse substring check against the full response body — sufficient to catch a leaked row but not a precise structural assertion.
- The `as Lowercase<Verb>` cast in `send` exists only because `String.prototype.toLowerCase()` widens the type to `string`; it restores the literal union supertest expects.
