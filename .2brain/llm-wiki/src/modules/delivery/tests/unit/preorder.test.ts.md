---
source: src/modules/delivery/tests/unit/preorder.test.ts
sha256: 2fea875221e2542d425bd282575ae86569245f6f373f4c933bcc99f29f0102e9
generated_at: 2026-11-08T05:46:32.681268+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/preorder.test.ts

## Purpose

Unit tests for the pure, decision-only preorder slip rules defined in the delivery domain. Each test row pins a specific input (dates, order lines, timezone) against a fixed clock and asserts the verdict the domain logic returns — which verdict to notify the buyer, whether a due notice is needed, how many shop days slipped, and what date the buyer retains after a notice. No side effects, no I/O, no buyer interaction is exercised here.

## Key elements

- **`judgeSlip` tests** — Verify the `kind` field (`'notify'` | `'earlier'`) for date changes of varying magnitudes, same-shop-day moves (timezone-dependent), cleared dates, and absent dates.
- **`expectedDateOf` tests** — Verify that the function returns the latest release date among lines still awaiting shipment, ignores fully-shipped lines, and returns `undefined` when any waiting line has no date or no lines remain.
- **`judgeMove` tests** — Verify the full judgment (including `undefined` when nothing was ever promised) against an agreed-date context.
- **`needsDueNotice` tests** — Verify the daily-sweep gate: past/expiring dates trigger `true`, already-noticed or far-future dates return `false`, and a later move re-arms the notice.
- **`slippedDays` tests** — Verify whole-shop-day counting (timezone-aware) and the floor at zero.
- **`promisedAfterNotice` tests** — Verify the buyer-held-date update logic, including the `null`-vs-`undefined` distinction for "clear the date" vs "no date was held."
- **Helpers** — `afterAgreed(days)`, `line(productId, quantity?, shipped?)` — small local factories for test fixtures.

## Relationships

- **`src/modules/delivery/domain/index.ts`** — Barrel import; the test pulls all six domain functions (`judgeSlip`, `judgeMove`, `expectedDateOf`, `needsDueNotice`, `slippedDays`, `promisedAfterNotice`) through this re-export point.
- **`src/modules/delivery/domain/preorder.ts`** — The module under test. The file header docblock explicitly states every row here exercises a row of this module against a fixed clock.

## Notes

- **Shop-day, not calendar-day.** Date comparisons are timezone-bound (`Europe/Rome` in the fixture). A move from 23:00 UTC one day to 20:00 UTC the next can be the *same* shop day. Tests pin both the UTC instant and the zone to make this explicit.
- **`null` vs `undefined` in `promisedAfterNotice`.** Passing `null` as the second argument means "the notice cleared the date" (returns `null`); passing `undefined` means "no date was ever held" (returns `undefined`). Tests assert both branches separately.
- **No severity threshold.** The `judgeSlip` tests deliberately cover 5 days, 29 days, and 365 days all yielding `'notify'`. A comment in the source makes the design intent explicit: the shop always tells, the buyer always decides; slip length never changes the verdict.
- **`needsDueNotice` looks 24 hours ahead.** A date 23 hours in the future triggers `true`; 25 hours does not. The boundary is inclusive of "exactly now."
