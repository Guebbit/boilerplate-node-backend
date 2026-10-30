---
source: src/modules/notifications/services/subscribers.ts
sha256: 41a756f4377a7807a24f1a262f890bc428f6f29700ebcc7ac466d9f2355c384a
generated_at: 2026-10-29T04:31:34.906167+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/subscribers.ts

## Purpose

Maps each domain event to the notification rows it produces. Every exported function is a one-to-one event handler that converts a `DomainEventMap` payload into either user-inbox rows (delegated to `notificationsCreate` in `./inbox`) or staff alerts (delegated to `./staff`). The module's `subscribe()` (wired in `./index`) attaches these handlers to the event bus; this file contains only the mapping logic, no I/O beyond the calls it delegates to.

## Key elements

- **`onCartLinesRemoved` / `onWishlistItemsRemoved`** – One `warning` row per affected user when a product leaves the catalogue. Share the private helper `removedFor`.
- **`onStockAlertSent`** – Single `info` row: the product the user asked about is back in stock.
- **`onCartMergeRefused`** – Single `warning` row listing all lines that could not be added during a guest-cart merge.
- **`onFulfillmentOrderHoldNoticed`** – `warning` row mirroring the hold notice to the buyer's inbox. No-ops when `userId` is undefined (erased account).
- **`onShipmentLost`** – `warning` row with staff-written message, items still owed, and expected replacement date. No-ops for erased accounts.
- **`onFulfillmentOrderDelayed`** – `warning` row informing the buyer of a date change. No-ops for erased accounts.
- **`onPurchaseHoldPlaced`** – Staff alert to the tenant's ban-capable set; deduped per `userId:until`.
- **`onWebhookSubscriptionAutoDisabled`** – Staff alert to the webhook-managing set; deduped per `subscriptionId:disabledAt`.
- **`onReturnRequested`** – Staff alert for a genuine return request. Silently skips `reason === 'withdrawal'` (withdrawals are born approved). Uses `DEPLOYMENT_TENANT_ID`.
- **`onOutboxEventDead`** – Staff alert to deployment administrators when an outbox event exhausts retries. Uses `DEPLOYMENT_TENANT_ID`.
- **`onTicketOpened`** – Staff alert to the *working* set (see `alertSetsOf`). If zero staff were notified and the ticket is a `contact`, falls back to `ticketService.mailFallbackMailbox`.
- **`onTicketAssigned`** – Single-member alert (`notifyStaffMember`) to the new assignee only.
- **`alertSetsOf`** (private) – Returns `['TicketManagement']` for contact tickets, `[routeSet]` otherwise. Deliberately excludes readers-only sets (`TicketDisplay`).

## Relationships

- **`@kernel/events`** – Source of the `DomainEventMap` type; defines every payload shape these handlers accept.
- **`../repository`** – Provides the `NewNotification` row type used in all inbox mappings.
- **`./inbox`** – `notificationsCreate` performs the actual DB writes; this file only builds the row arrays.
- **`./staff`** – `notifyStaff` / `notifyStaffMember` deliver staff-side alerts (email, digest, etc.) and return a count of recipients.
- **`@modules/tickets`** – `ticketService.mailFallbackMailbox` is called as a last resort when no staff member can receive a contact-ticket alert.
- **`@kernel/access/tenant`** – `DEPLOYMENT_TENANT_ID` scopes deployment-level alerts (outbox dead, return requested) to the platform tenant rather than a customer tenant.
- **`./index`** – Wires the exported handlers to the event bus via `subscribe()`.

## Notes

- **Erased-account guard.** Three handlers (`onFulfillmentOrderHoldNoticed`, `onShipmentLost`, `onFulfillmentOrderDelayed`) check `userId === undefined` and resolve immediately. No other handler needs this guard because their payloads always carry a `userId`.
- **Severity convention.** Buyer-facing rows are `warning` ("something changed without you asking") except `onStockAlertSent`, which is `info`. Staff rows inherit severity from the staff-routing layer, not from this file.
- **Optional param spread.** Handlers use `...(cond ? { key: val } : {})` to omit `params` fields (e.g. `message`, `expectedAt`, `owed`) when absent, keeping the stored row lean.
- **Dedupe keys** on every staff alert follow the pattern `<event>:<id>` (or `<event>:<id>:<timestamp>`) to suppress repeat deliveries of the same logical event.
- **`onTicketOpened` fallback is conditional on `told === 0`.** If even one staff member receives the alert, the fallback mailbox is *not* touched.
