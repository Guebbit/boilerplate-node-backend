---
source: src/modules/notifications/factories.ts
sha256: c75f226e92876a2a0fd6b10f40fe33d67467a4bea55454d9a7be6d9f44cec5fb
generated_at: 2026-10-29T04:28:31.440964+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/factories.ts

## Purpose

Test/seed factory that builds a `NotificationDocument` ready for `notificationRepository.create`. It exists so that tests and seeds can construct realistic notification rows without hand-assembling every field, while staying out of the production barrel to avoid triggering the service-level cap and live-push side effects.

## Key elements

- **`NotificationOverrides`** — The only required field is `userId` (24-char hex). Everything else is optional and defaults to sensible values (a single-product cart-line-removed body, `warning` severity, unread). The `staff` sub-object is the single switch that turns an "own message" into a work notice.
- **`makeNotification(overrides)`** — Returns a `Partial<NotificationDocument>` (not a full doc; `id`, timestamps, etc. are left to the repository). Converts `userId` to a Mongoose `ObjectId`, applies the body/severity defaults, conditionally expands `staff` into `audience`/`tenantId`/`sets`/`dedupeKey`/`expiresAt`, and stamps `readAt`/`createdAt` only when explicitly provided.

## Relationships

- **`src/modules/notifications/model.ts`** — Imports the `NotificationBody` and `NotificationDocument` types used for typing the overrides and return value.
- **`src/modules/notifications/tests/factories.ts`** — Consumes `makeNotification` (and the `NotificationOverrides` type) to build fixture rows in the notification test suite.

## Notes

- **Never reachable from the barrel.** The module docblock states it is intentionally kept out of the public export surface; import it via the `@modules/notifications/factories` path only.
- **`dedupeKey` default is random.** When `staff` is set but no `dedupeKey` is supplied, a fresh ObjectId hex string is generated each call. Two calls with the same `tenantId`/`sets` will *not* dedupe against each other unless the caller passes an explicit key.
- **`createdAt` pinning is a test-ordering tool.** Setting it is the documented way to control row age without sleeping between inserts; omitting it lets the repository stamp the real time.
- **Staff expiry is hard-coded to 30 days** from `Date.now()` at call time; it is not configurable through the overrides.
