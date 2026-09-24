---
source: tests/load/checkout.js
sha256: 706f90729eca1711431dec6e3fa3559a8e7226a2db5673b844f8db7ed4edd8bd
generated_at: 2026-09-23T20:09:11.845526+00:00
model: ollama:qwen3.8:27b
---

# tests/load/checkout.js

## Purpose

k6 load test that exercises the **write path under concurrency**: login → add item to cart → checkout. It intentionally has every virtual user share a single seeded customer account so that `reserveForOrder` stock-holding logic is the thing under pressure. It complements the two-caller race test in `tests/integration/concurrency/cart-races.test.ts` by asking whether that logic still holds (and stays within latency bounds) at fifty simultaneous checkouts.

## Key elements

- **`options`** (exported) — k6 stage config (ramp to 10 VUs over 20 s, hold 40 s, ramp down 10 s) and placeholder thresholds (p95 < 800 ms, < 2 % failed, > 95 % checks passed).
- **`login()`** — POSTs to `/account/login` per iteration (deliberately _not_ in `setup()`) and returns the `accessToken`. Placing it in the hot path means the auth endpoint shares the load.
- **`default export`** — the per-iteration script: calls `login()`, then within `group('fill the cart')` fetches the first product and POSTs it to `/cart/items`, then within `group('check out')` POSTs to `/cart/checkout`. A **409 response on checkout is counted as a pass** — it means the reservation logic correctly refused an over-committed order.
- **`EMAIL` / `PASSWORD`** — defaults to the seeded demo customer (`customer@example.com` / `password`); overridable via `K6_EMAIL` / `K6_PASSWORD` env vars. The canonical copy lives in `scenarios/accounts.ts`.
- **`BASE_URL`** — read from `__ENV.BASE_URL`, falls back to `http://localhost:3000`.

## Relationships

No dependency-graph neighbors are recorded for this file. It is a standalone k6 script that talks to the running application over HTTP; it has no import relationship with other project source files.

## Notes

- **It writes.** Every run creates orders and decrements stock. Always point it at a throwaway database and re-seed afterwards (`npm run scenario:apply:reset`). Never run against a database you care about.
- **Shared account is the point.** If you swap in per-VU accounts you change the test from "does reservation logic survive contention?" to "what is raw throughput?" — a different question.
- **409 ≠ failure.** The checkout check explicitly accepts `200 | 201 | 409`. Treating 409 as an error would flag a correctly-behaving API as broken.
- **Thresholds are placeholders.** They are set looser than the read-side test (`k6/browse.js`) because writes are inherently slower, not because they matter less. Replace with production-measured values before treating results as a SLA signal.
- **Login is per-iteration by design.** A single token minted in `setup()` and reused by all VUs would test a token cache, not the login path, and would remove one auth round-trip from every iteration.
