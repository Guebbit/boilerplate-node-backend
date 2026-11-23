---
source: src/modules/returns/services/notify.ts
source_sha256: 748fc45d7b9e00812ca58381cff51db5d968ecbe218a0d960701e1617a8e5e79
context_sha256: 99341b24a3584df4b25f060949fc4589ab12e3625272a1780f8f6685b845d5ec
generated_at: 2026-11-22T07:30:09.207383+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/notify.ts

## Purpose
Mails the customer about a return or withdrawal. It exposes listeners for the returns module's own events (`return.requested`, `return.decided`, `return.closed`). Because it hooks events rather than call sites, every way a return is opened, decided or closed is covered. A failed mail is logged and swallowed, so it never undoes the return operation.

## Key elements
- `mailReturnRequested({ returnId })`: acknowledges a newly opened return.
  - A withdrawal gets `withdrawal-acknowledged`, or `withdrawal-recorded` if staff opened it. Any other reason from the buyer gets `return-requested`.
  - Staff-opened non-withdrawals send nothing here, because `return.decided` covers them.
  - A return born closed (closed, never received) is mailed only if it is a withdrawal. That mail has no postage line and no address.
  - Withdrawals include `returnAddress()`. The `at` date is `requestedAt`.
  - `remedyChoice` comes from `isGuaranteeReason`.
  - For `withdrawal-recorded`, it adds `recorded: { via: statedVia ?? 'other', at: createdAt ?? now }`.
- `mailReturnDecided({ returnId, decision })`: picks the notice via `decidedNoticeOf`.
  - `declined` gives `return-declined`.
  - `approved` gives `return-approved`, or `return-opened` if staff opened the return.
  - It includes the decline reason and message, and the return address only on approval.
  - `at` is `requestedAt` for staff-opened returns, otherwise `decidedAt ?? now`.
- `mailReturnClosed({ returnId, refundAmount, currency, remedy })`: sends only if the return has `receivedAt`.
  - The notice is `return-replaced`, `return-repaired` or `return-closed`, chosen by `closedNoticeOf(remedy)`.
  - It includes the refund amount and currency.
- Internal helpers:
  - `withReturn` loads the return by id and swallows and logs any error.
  - `sendNotice` delegates to the orders module's buyer-mail policy and builds the mail with `returnNoticeEmail`.

## Relationships
- `../repository` loads the return by id. `../model` provides the `ReturnDocument` type.
- `@modules/orders` looks up the buyer, their locale and name, and supplies the order number and email.
- `../emails` (`returnNoticeEmail`) renders the copy for a notice kind. This file supplies the notice kinds and inputs.
- `@infrastructure/adapters/mailer` (`enqueueEmail`) queues the mail.
- `@infrastructure/adapters/logger` logs failures.
- `@modules/shop` (`returnAddress`) provides the address that tells the customer where to send the goods.
- `../domain` (`isGuaranteeReason`) decides `remedyChoice`.
- `@kernel/events` (`DomainEventMap`) types the event payloads.

## Notes
- The listeners must never reject. A rejection would make the event relay redeliver the event, and a failed mail is not worth that.
- `enqueueEmail` is fired with `void`, with an eslint disable. The comment says it never rejects and logs its own failure.
- Refunds for returns born closed are not mailed from here. The comment says `payments` has its own notice for them.
- The logger call in `withReturn` is wrapped in Stryker disable/restore comments, so mutation testing skips it.
