---
source: src/modules/delivery/domain/hold-notice.ts
source_sha256: 47bb842cbeeb2934c854803dc813edcf3b8972f626ead3df587c35ed41a36107
context_sha256: e50a6ac2a107a2d9f4dfab26e24a50e150b57d3e6e9f693454a122143af51fe1
generated_at: 2026-11-22T04:47:38.311012+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/domain/hold-notice.ts

## Purpose
Pure domain logic that maps a staff-entered fulfillment hold reason to what the buyer is actually told. Staff reasons can be internal (e.g. a risk check), and naming them would tip off the people a risk check targets. So the buyer sees one of three notices, and sensitive reasons are shown as the plainest one. Hiding the hold entirely is avoided because it would be a misleading "being prepared" status (UCPD Art. 6(1)(b)) and would leave address problems unfixable. See `src/modules/delivery/model.ts`.

## Key elements
- **`holdNoticeOf(reason)`**: returns the buyer-safe `FulfillmentHoldNotice` for a `FulfillmentHoldReason`:
  - `awaiting_stock` → `awaiting_stock`
  - `incorrect_address` → `check_address` (the buyer can act)
  - `high_risk`, `other` → `delayed` (so a risk hold cannot be told apart from a plain delay)
- **`holdNeedsBuyerNotice(reason, message)`**: returns whether a new hold earns a mail and an inbox row. It is true for `incorrect_address`, or for any other non-`awaiting_stock` reason when staff supplied a non-empty message. It is always false for `awaiting_stock`.

## Relationships
- Imports `FulfillmentHoldNotice` and `FulfillmentHoldReason` from `@types` (`src/types/index.ts`).
- Sits in the delivery `domain` folder, which has an `index.ts` neighbor. The index is presumably where the domain exports are gathered.
- `src/modules/delivery/presenter.ts` and `src/modules/delivery/services/announce.ts` are graph neighbors, so they are likely the consumers. The presenter plausibly uses the notice mapping, and the announce service the mail/inbox decision. The file content does not confirm this.
- Covered by `src/modules/delivery/tests/unit/hold-notice.test.ts`.

## Notes
- Both functions are pure, with no I/O.
- `awaiting_stock` never triggers a buyer notice, because a preorder group's creation also places a hold.
- A bare delay (`high_risk` or `other` with no message) is not mailed.
- `holdNeedsBuyerNotice` checks the message with `Boolean(message)`, so an empty string counts as no message.
- Any reason other than `awaiting_stock` or `incorrect_address` falls through to `delayed`, which is the safe default.
