---
source: src/modules/shop-tasks/tests/unit/openings.test.ts
sha256: e441a9e83803f52085a9b216b642247f3dbc45e2373c26fe5da258bfec883777
generated_at: 2026-11-14T21:58:51.694542+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/unit/openings.test.ts

## Purpose

Unit tests for the pure domain-opening functions in `src/modules/shop-tasks/domain/openings.ts`. Each test case asserts the shape of a `SystemOpening` (kind, route set, link, due date, message) returned for a given shop situation. No mocks or database access—every assertion is against literal expected values or derived dates.

## Key elements

- **`consentDueOpening` block** — Verifies the FTC delay-consent rule (16 CFR 435.2): opens only when the buyer already holds a promised date, measures the grace window as *agreed + 30 days*, respects later slips against the date the buyer now holds, and fires only for the six US-jurisdiction shops (US, PR, GU, VI, AS, MP) regardless of destination.
- **"the other openings" block** — Tabular test (`it.each`) over `refundOwedOpening`, `amountMismatchOpening`, `paidWithoutHoldOpening`, `refundRefusedOpening`, and `disputeOpening`, asserting that each names a valid `TaskKind`, a declared `PERMISSION_SETS` entry as its route set, and produces a stable `openKeyOf` identifier. Also checks that `amountMismatchOpening` routes to `AuditDisplay` (admin-only) and that `disputeOpening` uses `evidenceDueBy` when present, falling back to the reference timestamp otherwise.
- **`disputeAwaitingBankOpening` block** — Confirms a 75-day wait, `PaymentRefunding` route set, `payment`-type link, and the `noDueSoon` flag.
- **Refund openings block** — Asserts messaging: refusal does not offer cancellation; reversal is framed as "money owed again."
- **Legal deadline block** — Verifies that an optional `{ rule, day }` argument produces a "Legal refund deadline (…)" sentence in the message, that `faulty` items say "refund now" (no date), and that nothing is added when no rule is supplied.
- **`delay()` helper** — Factory returning a default delay-notice fixture (US ship, fixed dates) that individual tests override.

## Relationships

- **`src/modules/shop-tasks/domain/openings.ts`** — The system under test; all eight opening functions are imported and exercised here.
- **`src/modules/tasks/index.ts`** — Supplies `openKeyOf` (used to verify the composite key format) and the `SystemOpening` type that anchors every assertion.
- **`src/modules/tasks/domain/system.ts`** — Likely origin of the `SystemOpening` interface re-exported through the tasks barrel.
- **`src/modules/tasks/domain/lifecycle.ts`** — Part of the tasks module that defines task-kind semantics referenced via `TaskKind`.
- **`src/kernel/permissions.ts`** — `PERMISSION_SETS` is imported to validate that every route set assigned by an opening function corresponds to a declared permission set.
- **`src/types/index.ts`** — Provides `TaskKind` and `TaskLinkType` enums used in link and kind assertions.

## Notes

- The FTC jurisdiction list (`US, PR, GU, VI, AS, MP`) is hard-coded in the test rather than read from a constant in the implementation. If the implementation adds or removes a jurisdiction, the test will not automatically follow—keep them in sync.
- "Does not open" cases assert `toBeUndefined()`, not `null` or a falsy object. The domain contract is: no opening, not a void one.
- The "other openings" block deliberately asserts `subjectId` is `undefined` and `message` contains no email addresses—enforcing the convention that openings reference records, not people.
- `AGREED_PLUS_30` is computed once at module scope; date-sensitive tests depend on this being a fixed value (no `Date.now()`).
