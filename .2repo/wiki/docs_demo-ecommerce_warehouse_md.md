# docs/demo-ecommerce/warehouse.md

## Purpose

Conceptual documentation page for the warehouse domain in the demo ecommerce app. Explains the stock-movement rules, the two-figure inventory model, the manual actions an operator performs, the expired-hold sweep, and the shipping flow. Exists so a reader (human or AI) understands *why* stock numbers change and *what* is automatic vs. triggered before touching the implementing modules.

## Key elements

- **The one rule / six stock-movement events** — stock changes only via recorded events: delivery receipt, count adjustment, checkout (set aside), payment (sold), cancellation (released), or expiry (released). No direct number entry.
- **Two figures model** — every product tracks *on hand*, *set aside*, and the derived *available* (on hand − set aside). The page warns that confusing on-hand with available is the classic mistake.
- **Manual actions** — "delivery arrived" (receipt) and "count is wrong" (adjustment). Both are diary entries, not overwrites.
- **The sweep** — finds holds older than 30 min, releases goods back to the shelf, cancels the order, logs it. Explicitly does **not** run on a timer; an external trigger is required.
- **Running-low list** — filterable stock board; threshold is ≤ 5 (configurable). Demo seeds a permanent zero-stock item (Heavy-Duty Cat Scratching Post).
- **Shipping flow** — after "mark shipped," parcel record, tracking code, and customer email (localised) are generated automatically. Courier progress is faked via a single button.
- **Glossary** — plain-language definitions: On hand, Set aside, Available, The sweep, Adjustment, Receipt.

## Relationships

- **`docs/demo-ecommerce/index.md`** — parent index; this page is one of the section pages linked from it.
- **`docs/demo-ecommerce/manager.md`** — the manager is the human actor who performs the two manual actions (record delivery, record correction) and triggers the sweep.
- **`docs/modules/inventory.md`** — the implementing module for the stock diary, the two-figure model, and the low-stock threshold. This page links out to it for the "detail."
- **`docs/modules/inventory-reservations.md`** — the implementing module for set-aside holds and the sweep logic. This page links out to it for the sweep detail.
- **`docs/modules/delivery.md`** — the implementing module for the parcel record, tracking code generation, and the faked courier status button. This page links out to it.

## Notes

- **The sweep is not automatic.** No cron, no interval job ships with the demo. Until something explicitly calls it, expired holds keep stock invisible to customers. Run it at least as often as the 30-minute hold window.
- **Courier is a stub.** There is no real delivery integration; a button advances a parcel to *delivered*. Do not expect webhook or polling behavior.
- **This is a documentation page, not a source file.** It contains no importable symbols. All behavior described here is implemented in the linked `docs/modules/*` pages.
- **The "low" threshold (5) is a demo default** and can be changed; the page notes this explicitly.
