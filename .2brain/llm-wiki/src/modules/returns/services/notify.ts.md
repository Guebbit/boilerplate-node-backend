---
source: src/modules/returns/services/notify.ts
sha256: 9c8bab56adad5c46f8d3c7dd647a590d3add01a4e2d6b79bf37e38d3476e3684
generated_at: 2026-10-15T11:56:49.375829+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/notify.ts

## Purpose

Sends a single buyer-facing email about a return event (approval, cancellation, closure, etc.). It composes the orders module's buyer-mail policy (`mailBuyer` — resolve the buyer's preferred language with a safe fallback) with the returns module's email copy. Designed as a fire-and-forget helper: it never rejects, because every caller is mid state-change and a mail hiccup must not roll that change back.

## Key elements

- **`mailReturnNotice(kind, order, input)`** — the sole export. Resolves the buyer's locale and name via `mailBuyer`, builds the email (subject + template body) through `returnNoticeEmail`, injects `orderRef` from `order.orderNumber`, and enqueues the mail via `enqueueEmail`. Returns `Promise<void>`; settles once the mail is queued.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — imports `enqueueEmail`, the low-level transport that actually queues the message.
- **`src/modules/orders/index.ts`** — imports `mailBuyer`, the shared buyer-lookup / language-fallback policy.
- **`src/modules/orders/model.ts`** — imports the `OrderDocument` type used as the order parameter.
- **`src/modules/returns/emails.ts`** — imports `returnNoticeEmail` (template builder) and the `ReturnNoticeKind` / `ReturnNoticeInput` types that define what copy to send.
- **`src/modules/returns/services/create.ts`, `decide.ts`, `close.ts`, `cancel-remainder.ts`** — callers that invoke `mailReturnNotice` after completing their respective state transitions.

## Notes

- `orderRef` is **not** passed by the caller; it is derived from `order.orderNumber` inside this function. Callers pass `Omit<ReturnNoticeInput, 'orderRef'>`.
- The `void enqueueEmail(...)` call is intentionally detached — the `mailBuyer` wrapper swallows any rejection so the outer promise always resolves. A mail failure is logged upstream but never propagates to the state-change caller.
- This file contains no business logic beyond wiring; the "what to say" lives in `emails.ts`, the "how to send" lives in the mailer adapter, and the "who to send to / in which language" lives in the orders module.
