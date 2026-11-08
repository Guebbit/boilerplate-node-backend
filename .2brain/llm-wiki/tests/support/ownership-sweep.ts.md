---
source: tests/support/ownership-sweep.ts
sha256: 6450f81cd8e3133bef6b16d74252dd7b1e54b3ff99c966dbb4360c04de4bd627
generated_at: 2026-11-08T09:56:55.421251+00:00
model: ollama:qwen3.8:27b
---

# tests/support/ownership-sweep.ts

## Purpose

Shared harness for ownership-sweep tests. For a given customer-owned resource it sends two requests as customer B—one aimed at another customer's id, one at a non-existent id—and asserts the two answers are indistinguishable (parity), match the contract's documented status/error code, leave watched rows unchanged, and that a positive control (B's own id) still succeeds. A 422 on either attack is treated as an immediate failure because the request never reached the lookup.

## Key elements

- **`Verb`** — Union of `'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'`; the methods a contract may exercise.
- **`Attempt`** — Describes one HTTP request (method, path, bearer token, optional query/body) as customer B would send it.
- **`DocumentedAnswer`** — The contract's expected response for a foreign id: status, optional error code, optional `emptyPage` flag (200 with empty `items`), optional `without` filter name.
- **`OwnedCase`** — One test case: a `key`, the `DocumentedAnswer`, a factory `aim(foreign: boolean)` producing the `Attempt`, an optional `prepare` hook, and an optional `control` / `controlPassed` pair for the positive-control check.
- **`send(attempt): Promise<Response>`** — Executes a single request through the real app via `api()` from `./http`, lowercasing the verb to match supertest method names.
- **`shapeOf(response): string`** (private) — Serialises `{status, errors, items}` so two responses can be compared for parity.
- **`judge(owned, watch): Promise<string[]>`** — Runs the full case (prepare → before snapshot → foreign attack → missing attack → after snapshot → optional control) and returns an array of human-readable failure strings. An empty array means the case passed.

## Relationships

- **`tests/support/http.ts`** — Imports `api`, which `send` calls to obtain a supertest instance bound to the running app.
- **`tests/contract/ownership-contract.test.ts`** — Consumes `OwnedCase`, `judge`, and related types to define and execute ownership-sweep cases for the core ownership contract.
- **`tests/contract/ownership-shop.contract.test.ts`** — Same consumption pattern for the shop-specific ownership sweep; shares the identical `judge` pipeline.

## Notes

- `judge` does not throw; it accumulates problems into a string array. Callers are responsible for asserting the array is empty (typically in a `for` loop over their cases).
- The `watch` callback is called twice (before/after) and its return value is JSON-serialised; it must resolve to plain data, not a stream.
- `controlPassed` is optional; when absent, the default check is `own.status < 300`.
- `emptyPage` and `without` are mutually useful but independent: `emptyPage` verifies a 200 with zero items, while `without` verifies a named id never appears in the page body.
- The `Lowercase<Verb>` cast in `send` exists only because `String.toLowerCase()` widens the literal union to `string`; it is safe by construction.
