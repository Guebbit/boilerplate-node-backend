# docs/tools/concurrency-testing.md

## Purpose

Documents the philosophy, rules, and file map for the race-condition test suite. It exists to answer "does the invariant still hold when N requests hit the same write path simultaneously?"—a question that mutation testing (serial by construction) and the other integration suites cannot cover. It prescribes *how* these tests must be written (invariants, `allSettled`, no ordering asserts) so that a future contributor does not silently weaken them.

## Key elements

- **Four race patterns** (table in the file): check-then-insert, read→write→clear, read-modify-write on an array, contended upsert. Each maps to a specific fix and a specific test file.
- **Invariant-over-ordering rule**: tests must assert "exactly one winner" / "no duplicates", never "request A beats request B."
- **`Promise.allSettled` mandate**: `Promise.all` discards the losing outcomes that are the actual assertion target.
- **Mongoose operator semantics table**: `doc.tokens.push()` → `$push` (safe); `doc.tokens = filter/rebuild` → `$set` (unsafe). The hazard is *rebuilding* the array, not mutating it.
- **Fix-ordering rule**: teach the error interpreter (409 handling) *before* adding a unique index, or a data race becomes a 500 on normal signups.
- **Hit-rate comment convention**: each test file records how often the race was actually observed as contended, distinguishing "passes because correct" from "passes because the window never opened."
- **File map**: `auth-races.test.ts`, `cart-races.test.ts`, `race.ts`, `setup.ts` (see Relationships).

## Relationships

- **`tests/support/race.ts`** — provides `raceN`, status helpers, and the shared assertion that rejects 5xx, 429, and hung connections. Both test files import from here.
- **`tests/support/setup.ts`** — raises both halves of the `credentialLimiters` budget (per-account and per-address) so that a 10–12 participant race does not trip into 429s and mask the real assertion. The file documents *why* both are raised and that one case keeps a fresh limiter to prove the budget is still enforced.
- **`tests/integration/concurrency/auth-races.test.ts`** — exercises signup, login, token revocation, one-time reset tokens, and the limiter-proof case.
- **`tests/integration/concurrency/cart-races.test.ts`** — exercises cart upsert under contention, checkout, and account-deletion racing a cart write.
- **`docs/tools/cluster-testing.md`** — no direct interaction found in this file's content; listed only as a graph neighbor.

## Notes

- **Rate-limit trap**: with budgets left at shipped values, a 12-participant signup race starts returning 429s, and the "not two users" assertion passes *trivially* because two requests never reached the handler. The shared assertion in `race.ts` explicitly rejects 429 to catch this.
- **`--runInBand` is correct, not a workaround**: it serialises test *files*, not the concurrent requests inside a test. Removing it would make tests flaky (shared in-memory Mongo across parallel workers), not more concurrent.
- **Verification before "fixing"**: rewrite a suspected lost-update as a rebuild and confirm the suite goes red. If reverting leaves everything green, there was no bug; the deliverable is a test pinning the invariant plus a comment, not a changelog entry.
- **Run command**: `npm run test:integration`—these tests are part of the ordinary integration suite and gate merges alongside the rest; there is no separate `test:concurrency` script.
