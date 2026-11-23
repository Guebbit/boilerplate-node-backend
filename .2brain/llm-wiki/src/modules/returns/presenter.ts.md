---
source: src/modules/returns/presenter.ts
source_sha256: a53765500306cd85088049ebebf0a691530463629230d253de5d10d3c2f8304e
context_sha256: 6f87d00732645161c76637d22e46e2a6e998c6bb21bc664f272ecfa9953ccbf5
generated_at: 2026-11-22T07:26:43.896312+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/presenter.ts

## Purpose
Single place where a stored return document is converted into the `Return` contract type, plus a helper that builds a slim list row. The read service builds on this to add the `actions` a caller may take.

## Key elements
- `StoredReturn` — type: `Return` without `actions` (a return as stored and read back).
- `presentReturn(document)` — calls `document.toJSON()` and casts the result to `StoredReturn`. The model's transform does the real work: `_id` → `id`, `__v` and `shippingRefund` dropped, Decimal128 → string, dates and ObjectIds → text.
- `presentReturnListItem(returned, actions)` — returns a `ReturnListItem` with only the table columns: `id`, `orderId`, `orderNumber`, `status`, `reason`, `kind`, `requestedAt`, `createdAt`, plus the supplied `actions`.

## Relationships
- `src/modules/returns/model.ts` — supplies `ReturnDocument` (type-only import). The `toJSON` transform that `presentReturn` relies on is defined with the model.
- `src/types/index.ts` (`@types`) — supplies the `Return`, `ReturnActions` and `ReturnListItem` contract types.
- `src/modules/returns/services/read.ts` — builds on this module to attach `actions` to returns and list items.
- `src/modules/returns/repository.ts` — no direct import here; its documents are what `presentReturn` is given.

## Notes
- The document is typed as stored, not as the wire shape `Return` promises, so `presentReturn` uses a cast. The comment says `serialize.ts` ensures `toJSON` leaves no date or id objects, and the contract tests check the rest.
- List items deliberately omit the customer's note, staff's decline message and the lines. Those belong to the audited detail read.
