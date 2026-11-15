---
source: src/modules/notifications/presenter.ts
sha256: 3469048745570a1beb233f2f14afe58983b79713ad794c34d77cd11f667bd5aa
generated_at: 2026-11-14T20:25:50.499204+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/presenter.ts

## Purpose

Transforms internal `NotificationDocument` objects into the exact wire shapes declared by `openapi.yaml`. Objects are **built** (field-by-field) rather than serialized, guaranteeing that any field not named in the contract can never leak into a response.

## Key elements

- **`NotificationsView`** (interface) — The inbox response envelope (`{ items: Notification[] }`), matching the `NotificationsResponse` schema in the OpenAPI contract.
- **`bodyOf`** (private helper) — Re-reads the stored `code` + `params` pair and casts it back to the `NotificationBody` discriminated union. The cast is a deliberate *narrowing* step: writers (`NewNotification`) are already typed per-code, so this restores the pairing that mixed storage loses without a per-code switch.
- **`presentNotification`** (exported) — Maps one `NotificationDocument` to the contract's `Notification`. Stringifies `_id`, spreads the resolved body, and conditionally includes `readAt` (omitted when unread, rather than `null`, because the stream payload cannot express null).
- **`presentNotifications`** (exported) — Maps an array of documents to `NotificationsView` via `presentNotification`.

## Relationships

- **`src/modules/notifications/model.ts`** — Imports `NotificationBody` and `NotificationDocument`; those are the input types the presenter consumes.
- **`src/types/index.ts`** — Imports the `Notification` type, which is the contract's wire shape the presenter must produce.
- **`src/modules/notifications/services/inbox.ts`** — Upstream consumer that fetches documents and hands them to `presentNotifications` before returning a response.
- **`src/modules/notifications/index.ts`** — Module barrel; re-exports the presenter's public surface.
- **`src/modules/notifications/tests/unit/presenter.test.ts`** — Unit tests covering the mapping logic (including the `readAt` omission and the `bodyOf` narrowing).

## Notes

- The cast in `bodyOf` is **not** a safety escape hatch. It relies on the invariant that every writer already produces a valid `code`/`params` pair matching the `NotificationBody` union. If a new code is added, the writer must extend the union first; the cast simply recovers what the writers promised.
- `readAt` is **absent** (key omitted) when the notification is unread. Downstream consumers must check for key presence, not `null`.
- `createdAt` and `readAt` are serialized with `.toISOString()`; the wire format is always an ISO-8601 string, never a `Date`.
