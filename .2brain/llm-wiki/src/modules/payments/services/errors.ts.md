---
source: src/modules/payments/services/errors.ts
sha256: d992f2407a813ecab01878602320e08e2222fd49168b558e28821033cb5a7021
generated_at: 2026-10-15T11:29:30.983385+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/errors.ts

## Purpose

Provides the two canonical 409 refusal responses for the payments service: an order that is no longer payable, and card payment being unavailable in this deployment. It is a deliberate leaf node (no persistence or cross-service imports) so any file under `services/` can import a standardised error response without pulling in extra dependency edges.

## Key elements

- **`notPayable(): ResponseReject`** — Returns a `409` with `ERROR_CODES.PAYMENT_ORDER_NOT_PAYABLE` and an i18n message. Covers three upstream scenarios (failed `isPayable` check, race between check and write, bounce because the order vanished) under one code/message pair.
- **`cardNotAvailable(): ResponseReject`** — Returns a `409` with `ERROR_CODES.PAYMENT_CARD_NOT_AVAILABLE` and an i18n message. Used when `NODE_PAYMENT_PROVIDER` is unset and a client attempts a card intent anyway.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `generateReject` and the `ResponseReject` type; all error responses in this file are built through that helper.
- **`src/infrastructure/i18n/index.ts`** (and `context.ts`) — Imports the `t()` translation function used for both user-facing messages.
- **`src/modules/payments/services/intent.ts`**, **`offline.ts`**, **`settlement.ts`** — Consumer services that call `notPayable` / `cardNotAvailable` to short-circuit a request before any write or external call.

## Notes

- Both responses are **409 Conflict**, not 404 or 422. Clients are expected to treat the `code` field (not the HTTP status) as the discriminator.
- The module intentionally avoids importing from any other `services/` file or from persistence layers. If you find yourself wanting to add such an import here, the leaf invariant is being broken — reconsider placement.
- `cardNotAvailable` is a deployment-level condition, not a per-request state; in environments where a card provider *is* configured this function is never reached.
