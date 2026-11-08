---
source: src/modules/notifications/factories.ts
sha256: 1624646fef2386e2f7a8ef1c1b9dad651042e099cc0907bb1cc5a99eb6ffc29d
generated_at: 2026-11-08T06:31:25.975468+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/factories.ts

## Purpose

Test and seed factory for notification documents. It centralizes the construction of a valid `Partial<NotificationDocument>` so that tests and seed scripts don't repeat boilerplate, and it is deliberately excluded from the module barrel to keep it out of production code paths.

## Key elements

- **`NotificationOverrides`** (exported interface) — the input contract for the factory. Requires `userId`; optionally accepts `body` (code + params as a pair), `severity`, `readAt`, a `staff` block, and `createdAt`.
- **`makeNotification(overrides)`** (exported const) — returns a `Partial<NotificationDocument>` ready for `notificationRepository.create`. Applies defaults (severity `warning`, a webhook-disabled work-notice body) and conditionally adds staff-audience fields or read/readAt timestamps.

## Relationships

- **`src/modules/notifications/model.ts`** — source of the `NotificationBody` and `NotificationDocument` types that shape both the interface and the return value.
- **`src/domain-primitives/time.ts`** — provides `DAY_MS`, used to compute the 30-day `expiresAt` on staff notifications.
- **`src/modules/notifications/tests/factories.ts`** — consumes `makeNotification` to build fixture rows in notification tests.

## Notes

- **Not in the barrel.** The module doc comment states it is reachable only via the direct path `@modules/notifications/factories`; importing it from the barrel would bypass the service's cap and push enforcement.
- **`body` is a pair, not two fields.** `code` and `params` are bundled so a caller cannot accidentally mix one notification's code with another's params.
- **Staff `dedupeKey` default.** If omitted, the factory generates `test:<random 24-hex>` — safe for tests but not meaningful in production seeds.
- **`createdAt` override.** Exists purely so tests can control row ordering without `sleep` between inserts; it is optional and omitted by default.
