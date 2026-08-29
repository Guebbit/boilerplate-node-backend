# k6/checkout.js

## Purpose

k6 load-test for the write path (login → add to cart → checkout). Its specific target is the `reserveForOrder` stock-hold logic: verifying that concurrent checkouts of the same product remain correct and acceptable under load, complementing the two-caller race test in `tests/integration/concurrency/cart-races.test.ts` with a fifty-VU stress run.

## Key elements

- **`options`** (exported) — Stage schedule (ramp to 10 VUs, hold, ramp down) and placeholder thresholds (p95 < 800 ms, < 2 % failed, > 95 % checks passing).
- **`login()`** — POSTs to `/account/login` per iteration and returns the bearer token. Runs inside each VU so the auth path shares the load rather than being cached.
- **`default`** (exported iteration) — Three grouped steps: *fill the cart* (GET `/products`, POST `/cart/items`) and *check out* (POST `/cart/checkout`). Bails early if login or product lookup fails.
- **Constants** — `BASE_URL` (env `BASE_URL`), `EMAIL`/`PASSWORD` (env `K6_EMAIL`/`K6_PASSWORD`, defaulting to the demo credential in `db/demo/demo-data.json`).

## Relationships

No files are linked in the dependency graph. The file cross-references (by name only, not import):

- `k6/browse.js` — for how to seed real thresholds once you have them.
- `tests/integration/concurrency/cart-races.test.ts` — the two-caller unit test this load test scales up.
- `db/demo/demo-data.json` — canonical source of the demo `credentials.user` used as the shared account.

## Notes

- **409 is a pass, not a failure.** A conflict on checkout means the reservation logic correctly refused an order it could not cover. Counting it as an error would flag a correctly-behaving API as broken.
- **All VUs share one account deliberately.** The demo dataset has only two accounts; fifty users hitting the same customer is the contention under test. Splitting into per-VU accounts changes the question being measured.
- **This writes.** Orders are created and stock moves. Run against a throwaway database and re-seed with `npm run db:seed:reset` afterwards.
- **Login is per-iteration, not in `setup()`.** A shared token would test the cache, not the auth path.
- **Thresholds are placeholders.** Writes are slower than reads, so the p95 ceiling is set higher than in `browse.js` — not because they matter less.
