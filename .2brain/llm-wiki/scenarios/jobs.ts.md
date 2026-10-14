---
source: scenarios/jobs.ts
sha256: 0fa10df806650d3a2fb7ebc775975a223be3eff4815da0627c8bbb6262ec5a7f
generated_at: 2026-10-14T06:58:57.236811+00:00
model: ollama:qwen3.8:27b
---

# scenarios/jobs.ts

## Purpose

Defines the on-demand background jobs available to the demo test profile. A time journey first advances the test clock, then invokes the job whose trigger condition became true. Each job delegates to the same `orderService` function used by production ops scripts, so the test exercises the real sweep logic.

## Key elements

- **`DEMO_JOBS`** (`ReadonlyMap<string, () => Promise<number>>`) — the registry of runnable jobs keyed by URL segment name. Currently contains a single entry:
  - `reap-orders` → calls `orderService.anonymizeDueOrders()` (PII scrub of orders past retention). Returns the count of rows affected so a spec can assert the sweep actually did work.

## Relationships

- **`scenarios/support/demo.ts`** — the HTTP handler for `POST /__test/jobs/:name` looks up the requested job name in `DEMO_JOBS` and invokes it. This file is the data source that route consumes.
- **`src/modules/orders/index.ts`** — barrel re-export consumed as `@modules/orders`; provides the `orderService` instance used here.
- **`src/modules/orders/services/index.ts`** — implements `orderService.anonymizeDueOrders()`, the actual sweep logic that `reap-orders` delegates to.

## Notes

- A `Map` is used deliberately instead of a plain object: job names are raw URL segments, and `Map.get()` avoids accidental hits on inherited properties like `constructor` that a bracket-notation lookup on a plain object could trigger.
- The `() => Promise<number>` return contract is intentional — it lets test specs assert a non-zero count rather than merely "no exception was thrown."
- To add a new job, append an entry to the `Map` constructor array. No other wiring is needed; the route in `demo.ts` already handles arbitrary keys generically.
