---
source: src/modules/payments/presenter.ts
sha256: 81dc3e8c52cb60d33ea819498ff9447fcfd4ada3930761afa5c1db3196fa359d
generated_at: 2026-10-15T11:27:04.497177+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/presenter.ts

## Purpose
Sole transformation point from a stored `PaymentDocument` to the wire-level `Payment` contract. Every write endpoint (confirm, offline, refund, sync, intent) and read service serialises through `presentPayment` here, so field-stripping, `displayStatus` derivation, and the payer-vs-staff split all live in one file.

## Key elements
- **`StaffFields`** (interface) — shape of the extra data only a `payments.any.read` holder receives: optional `providerRef` and a refunds array of `providerRefundRef` / `failureReason`.
- **`staffFieldsOf(raw)`** — extracts the staff-only slice from a stored document; omits keys that are absent rather than emitting `undefined`.
- **`withStaffFields(wire, staff)`** — merges `StaffFields` into an already-presented `Payment`, splicing per-refund provider fields by index.
- **`presentPayment(document, staff?)`** — the main entry point. Calls `document.toJSON()` (model's `_id → id`, date → ISO-string transform), adds `displayStatus` via `displayStatusOf`, and conditionally layers on staff fields. Returns a plain `Payment`.

## Relationships
- **`./model` (`PaymentDocument`, `RefundRecord`)** — the stored shapes this file reads from; `toJSON()` on the document performs the id/date remapping.
- **`./domain` → `display-status.ts`** — supplies `displayStatusOf(document)`, the single source of truth for the derived `displayStatus` field.
- **`types/index.ts` (`Payment`, `Refund`)** — the target wire contract; `presentPayment`'s return type and the shape of every serialized refund.
- **`controllers/post-payment-{confirm,offline,refund,sync}.ts`** and **`services/intent.ts`** — write endpoints that call `presentPayment` to build their HTTP response body.
- **`services/view.ts` / `services/list.ts`** — read paths; `view.ts`'s `withActions` wraps `presentPayment` to append an `actions` array, `list.ts` calls it per row.
- **`tests/integration/{cancelled,refunds}.test.ts`** — assert on the output of `presentPayment` (especially the staff-refund `failureReason` path).

## Notes
- `document.toJSON()` is model-internal; the cast `as Omit<Payment, 'displayStatus'>` is necessary because the compiler cannot see through `toJSON`'s transform to confirm the wire shape.
- Optional staff fields are conditionally spread (`...(x ? { x } : {})`) so the JSON payload omits absent keys entirely rather than emitting `null`/`undefined`.
- `withStaffFields` relies on **index-alignment** between `wire.refunds` and `staff.refunds` — the mapping in `staffFieldsOf` preserves order, so no id-matching is needed.
- `services/view.ts` is the only caller that adds `actions`; all other endpoints return `presentPayment`'s result verbatim.
