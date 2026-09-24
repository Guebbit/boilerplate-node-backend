---
source: src/modules/payments/services/lookup.ts
sha256: 4af8b28968f4f45c60220e5950c7862f5a42c81d1ab54b8cc1e05d88a47332f3
generated_at: 2026-09-23T19:21:16.665411+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/lookup.ts

## Purpose

Thin lookup layer that resolves an RF bank-transfer reference to the order it pays. It sits one step in front of the existing `POST /payments/order/{orderId}/offline` settlement endpoint, letting an admin confirm _which_ order a pasted reference maps to before settling it. No settlement logic lives here.

## Key elements

- **`getOrderByReference(ref: string)`** _(sole export)_ — Parses the raw reference string via `parseReference`, queries `orderService.getByTransferReference`, and returns either `ResponseSuccess<OrderDocument>` or a 404 `ResponseReject`. A malformed reference and an unmatched reference both produce the identical 404 payload.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `generateSuccess`, `generateReject`, and the `ResponseSuccess` / `ResponseReject` types used to shape every return value.
- **`src/infrastructure/i18n/index.ts`** (re-exported by `context.ts`) — Imports the `t` helper; the 404 message key is `payments.order-not-found`.
- **`src/modules/orders/index.ts`** — Barrel import source for `orderService`, `parseReference`, and the `OrderDocument` type. The underlying implementations live in `services/index.ts` (`orderService`), `domain/transfer-reference.ts` (`parseReference`), and `model.ts` (`OrderDocument`).
- **`src/modules/payments/services/index.ts`** — Re-exports `getOrderByReference` as part of the payments service public surface.
- **`src/modules/payments/tests/integration/lookup.test.ts`** — Integration tests covering the reference→order resolution path.

## Notes

- **Deliberate 404 conflation:** A malformed reference (fails `parseReference`) and a well-formed-but-unmatched reference both return the same 404 body. This is intentional so a client cannot distinguish "typo" from "unknown code."
- **Pre-reference orders are unreachable here:** Orders created before the transfer-reference field existed have no reference and cannot be found through this function; the admin must use the normal order-search flow instead.
- **Read-only:** This file performs no mutations. Settlement is the responsibility of the separate `recordOfflinePayment` endpoint.
