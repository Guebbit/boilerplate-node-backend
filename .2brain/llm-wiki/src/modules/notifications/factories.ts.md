---
source: src/modules/notifications/factories.ts
sha256: d6fa3b20ecd2da5a9540024a264334b13f0f2cd797171e6c62f31bdce3675d4d
generated_at: 2026-10-15T10:50:11.681963+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/factories.ts

## Purpose

Test and seed factory that builds a `Partial<NotificationDocument>` ready for `notificationRepository.create`. It isolates the "how to construct a valid notification row" logic so tests and seeds don't repeat the shape and default wiring.

## Key elements

- **`NotificationOverrides`** (interface) — the subset of fields a caller may vary. `userId` is required; `body`, `severity`, `readAt`, and `createdAt` are optional. `body` bundles `code` + `params` together to prevent mismatching one message's code with another's params.
- **`makeNotification(overrides)`** (exported const) — returns a `Partial<NotificationDocument>` with sensible defaults (severity `warning`, a `cart-line-removed` body for a single "Blue mug" product). `userId` is wrapped in `new Types.ObjectId`. `readAt`/`createdAt` are conditionally spread so omitted keys are absent rather than `undefined`.

## Relationships

- **`src/modules/notifications/model.ts`** — source of the `NotificationBody` and `NotificationDocument` types that this factory shapes and returns.
- **`src/modules/notifications/tests/factories.ts`** — the primary consumer; pulls `makeNotification` to build fixture rows inside notification tests.

## Notes

- **Intentionally excluded from the barrel export.** The module doc comment states it is reachable only via `@modules/notifications/factories` because writing a row through the public service path would trip the cap / live-push enforcement the service layer enforces. Tests must import this path directly.
- `userId` in the overrides interface is typed as `string` (24-char hex) and only becomes an `ObjectId` inside `makeNotification`; callers don't need to construct the `Types.ObjectId` themselves.
- Defaults are baked into the factory (specific `productId`, English title) — tests that need a different body must supply the full `{ code, params }` pair, not just one field.
