---
source: scenarios/jobs.ts
sha256: 23c484edaa32e13c030cd164836a1175620b0c71f3c79d0ef720f2b27cf44ce5
generated_at: 2026-10-01T12:22:12.380850+00:00
model: ollama:qwen3.8:27b
---

# scenarios/jobs.ts

## Purpose

Defines the set of background jobs the demo profile can trigger on demand via a test endpoint. Each entry wraps the same production service call that the corresponding `scripts/ops/` script makes, so the demo lever exercises the real sweep logic rather than a mock copy.

## Key elements

- **`DEMO_JOBS`** (`ReadonlyMap<string, () => Promise<number>>`) — The registry of all triggerable jobs, keyed by their URL-segment name. Each value is a zero-arg async function that invokes a service and returns the number of records the sweep affected, so a spec can assert the job actually did work. Currently contains one entry:
  - `reap-orders` → calls `orderService.anonymizeDueOrders()` (scrubs PII on orders past their retention window).

## Relationships

- **`src/app/demo.ts`** — Consumes `DEMO_JOBS` to wire the `POST /__test/jobs/:name` route; the URL segment becomes the lookup key in the map.
- **`src/modules/orders/index.ts`** — Imported as `@modules/orders`; re-exports `orderService`, which `DEMO_JOBS` calls.
- **`src/modules/orders/services/index.ts`** — Underlying implementation of `orderService.anonymizeDueOrders()` that the `reap-orders` entry delegates to.

## Notes

- A `Map` is used deliberately instead of a plain object: the lookup key is an arbitrary URL segment, and a `Map` prevents accidental hits on inherited properties like `constructor` or `__proto__`.
- Job names are hyphenated URL slugs (`reap-orders`), not dotted identifiers, because they travel as path segments.
- The return type is `Promise<number>` (a count), not `void`, so assertions can verify the sweep was non-empty.
