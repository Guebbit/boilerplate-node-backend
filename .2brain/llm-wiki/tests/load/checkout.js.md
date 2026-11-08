---
source: tests/load/checkout.js
sha256: bdb413176cc67b262306f355c963ad6b54597debc346afeb11a62a92c332d3a5
generated_at: 2026-11-08T09:50:36.658703+00:00
model: ollama:qwen3.8:27b
---

# tests/load/checkout.js

## Purpose

k6 load test for the **write path** under concurrency: log in, add an item to the cart, and check out. Its goal is to stress `reserveForOrder` with 50 simultaneous virtual users contending for the same product's stock, exposing races that the two-caller integration test (`tests/integration/concurrency/cart-races.test.ts`) covers in isolation.

## Key elements

- **`options`** — 70-second ramp to 10 VUs, hold, ramp down. Thresholds are placeholders (p95 < 800 ms, < 2 % failures, > 95 % checks); see `tests/load/browse.js` for how to calibrate real numbers.
- **`login()`** (internal) — POSTs credentials to `/account/login`, returns the bearer token. Called **per iteration** (not once in `setup()`) so the auth endpoint shares the load.
- **default export** (per-iteration scenario) —
  - *fill the cart*: GET `/products`, take the first item id, POST `/cart/items`.
  - *check out*: POST `/cart/checkout`. A **409 response is treated as a pass** — the API correctly refused an order it could not cover.

## Relationships

No graph neighbors.

## Notes

- **Destructive.** Every iteration creates real orders and decrements stock. Point `BASE_URL` at a throwaway database and re-seed afterwards (`npm run scenario:apply:reset`). Never run against a shared or production DB.
- **Shared account is intentional.** All VUs authenticate as the same seeded customer (`customer@example.com` / `password`, defined in `scenarios/accounts.ts`). This maximises contention on the same product's reservation. Giving each VU its own account would measure throughput, not the reservation race.
- **409 ≠ failure.** The checkout check explicitly accepts `200 | 201 | 409`. Counting 409 as an error would flag a correctly-behaving API as broken.
- **Credentials are not secrets.** They are the public demo seed credentials; change them in `scenarios/accounts.ts`, not here.
- Run with `BASE_URL=http://localhost:3000 npm run bench:k6 checkout`.
