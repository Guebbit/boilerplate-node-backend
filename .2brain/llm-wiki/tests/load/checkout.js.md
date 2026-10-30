---
source: tests/load/checkout.js
sha256: bdb413176cc67b262306f355c963ad6b54597debc346afeb11a62a92c332d3a5
generated_at: 2026-10-29T07:05:17.821108+00:00
model: ollama:qwen3.8:27b
---

# tests/load/checkout.js

## Purpose

k6 load test that exercises the full write path (login → add to cart → checkout) under concurrency. Its goal is to verify that the stock-reservation logic (`reserveForOrder`) stays correct and within latency bounds when many virtual users race for the same product, complementing the two-caller proof in `tests/integration/concurrency/cart-races.test.ts` with a fifty-user stress scenario.

## Key elements

- **`options`** — k6 stage schedule (ramp to 10 VUs, hold 40 s, ramp down) plus placeholder thresholds (`p95 < 800 ms`, failure rate < 2 %, check pass rate > 95 %).
- **`login()`** — Posts to `/account/login` with the shared seeded credentials, returns the bearer token. Called per iteration so the auth path also carries load.
- **`default` (exported iteration function)** — Three-phase flow: `login()` → `group('fill the cart')` (GET `/products`, POST `/cart/items`) → `group('check out')` (POST `/cart/checkout`).
- **Module-level constants** — `BASE_URL`, `EMAIL`, `PASSWORD` pulled from `__ENV` with fallbacks matching `scenarios/accounts.ts` seed values.

## Relationships

No dependency-graph neighbors are recorded for this file. It references, in comments only:

- `tests/integration/concurrency/cart-races.test.ts` — the two-caller correctness test this load test scales up.
- `tests/load/browse.js` — sibling read-path load test; cited as the place to copy real thresholds once they are seeded.
- `scenarios/accounts.ts` — source of the seeded credentials used here.

## Notes

- **Writes real data.** It creates orders and decrements stock. Always target a throwaway DB and re-seed afterward (`npm run scenario:apply:reset`).
- **Shared account is intentional.** All VUs log in as the same customer to maximise contention on the same stock row. Switching to per-VU accounts changes the question being measured.
- **409 on checkout is a pass.** The check in the checkout group accepts `200 | 201 | 409`; a 409 means the reservation logic correctly refused an unfillable order.
- **Credentials are not secrets.** They mirror the seeded demo account; change them in `scenarios/accounts.ts`, not here.
- **Thresholds are placeholders.** They are intentionally looser than a production SLO; calibrate against `browse.js` once real baselines exist.
