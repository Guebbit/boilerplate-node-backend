---
source: src/modules/returns/tests/unit/domain.test.ts
source_sha256: 5c35209827ac179751233841dfe814e0096a14dbcd19d0dbf55d3c0310addd3f
context_sha256: 1c786b9ab7ba1816ff3f20e1959c3a39dc307bba33890f64b10331e54deb8abd
generated_at: 2026-11-22T07:38:54.185247+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/unit/domain.test.ts

## Purpose
Unit tests for the pure, database-free rules of the returns module: choosing a return's initial status, building and validating return lines, working out how many units remain returnable, accounting for settled returns and cancellations, determining which return reasons are still open, and resolving restock. Because nothing touches a database, each boundary condition can be tested directly.

## Key elements
Each `describe` block covers one function or concept from the domain barrel (`../../domain`):
- **`initialStatusFor`**: a `withdrawal` starts `approved`; `defective`, `wrong_item` and `other` start `requested`.
- **`wireLines`**: turns product ids into strings and keeps quantities.
- **`returnableLinesOf`**: drops items matching an exclusion predicate (e.g. digital goods) and keys the rest by string id.
- **`quantitiesByProduct`**: sums quantities per product across lines and returns a `Map`.
- **`returnableQuantities`**: ordered quantities minus quantities already returned, summed per product and floored at 0.
- **`checkRequestedLines`**: returns `{ ok, lines }` or `{ ok: false, reason }`. The reasons are `nothing-returnable`, `too-many` and `unknown-product`. With no lines or an empty list it takes everything left. Duplicate product lines are summed before the limit check.
- **`holdsReturnedGoods`**: true for returns in `QUANTITY_HOLDING_RETURN_STATUSES`. False for `declined`, for cancellations, and for `replace`/`repair` remedies, whose units the buyer has again.
- **`takesLastUnit`**: true only when every ordered unit is accounted for. It is measured against the ordered quantities, so unrelated products don't help.
- **`accountsOf`**: given records and a currency, produces `{ accountedFor, shippingRefunded }`.
  - It counts cancellations and returns whose goods are back.
  - It ignores returns that are `approved`, `declined`, `canceled` or `requested`.
  - It ignores `replace` and `repair` remedies.
  - It sums shipping refunds in minor units (`'0.10' + '0.20'` gives `'0.30'`, `'4.00' + '1.50'` gives `'5.50'`).
  - It returns `'0.00'` when there are no records.
- **`BACK_RETURN_STATUSES`**: asserted to equal `['received', 'closed']`.
- **`reasonsOpenAt`**: given `withdrawUntil` and `conformityUntil` deadlines and a "now" date, returns the open reasons.
  - With no deadlines it returns `withdrawal`, `defective`, `wrong_item` and `other`.
  - After the withdrawal deadline only `defective` and `wrong_item` remain.
  - After both deadlines it returns none.
  - The deadline instant itself still counts as open.
- **`resolveRestock`**: tested, but its cases fall outside the visible content.
- The suite also imports `checkStatement`, `policyExceptionsOf` and `resolveRestock`.
- Local helper `id(value)` builds an object that stringifies to the given product id.

## Relationships
- Imports everything from `src/modules/returns/domain/index.ts`, the barrel for the module's domain code. The neighbor files are the likely sources of the exports under test:
  - `lifecycle.ts`: statuses and `initialStatusFor`.
  - `quantities.ts`: line and quantity functions.
  - `accounting.ts`: `accountsOf` and `takesLastUnit`.
  - `reasons.ts`: `reasonsOpenAt`.
  - `restock.ts`: `resolveRestock`.
  - `statement.ts`: `checkStatement`.
- This mapping is inferred from the file names, not confirmed by the test's imports.

## Notes
- Tests use structural stand-ins such as `{ toString: () => 'abc' }` for ids rather than real database ObjectIds.
- Several test names state the business rule behind them: withdrawal is a right, not a grant; two lines of one are no way past a limit of one; cancellations never shipped.
