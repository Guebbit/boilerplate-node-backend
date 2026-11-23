---
source: src/modules/notifications/factories.ts
source_sha256: 1624646fef2386e2f7a8ef1c1b9dad651042e099cc0907bb1cc5a99eb6ffc29d
context_sha256: 110cd203bf1f9a628ca21c2c8e2a782c3a4c5b7ac97fa843b2f5fc998ad890e8
generated_at: 2026-11-22T05:53:37.390056+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/factories.ts

## Purpose
Test and seed helper that builds notification rows. It is exposed at `@modules/notifications/factories` and deliberately kept out of the module barrel, because it writes rows directly, bypassing the cap and the live push that a service enforces.

## Key elements
- `NotificationOverrides` – input shape. `userId` (24-char hex) is required. Optional fields:
  - `body`: a code and its params together, so they can't be mismatched.
  - `severity`
  - `readAt`
  - `staff`: `{ tenantId, sets, dedupeKey? }`
  - `createdAt`
- `makeNotification(overrides)` – returns a `Partial<NotificationDocument>` ready for `notificationRepository.create`.
  - `userId` is converted to a `Types.ObjectId`.
  - `body` defaults to code `notifications.staff.webhook-disabled` with a fixed `subscriptionId` param.
  - `severity` defaults to `warning`.
  - `readAt` and `createdAt` are included only when provided.
  - With `staff`, the row becomes a work notice: `audience: 'staff'`, plus `tenantId`, `sets`, a `dedupeKey` and an `expiresAt`. The `dedupeKey` defaults to `test:<random ObjectId hex>`. `expiresAt` is 30 days from now.
  - Without `staff`, none of the staff fields are set (an "own message").

## Relationships
- `./model` – supplies the `NotificationBody` and `NotificationDocument` types (type-only import).
- `@domain-primitives/time` – supplies `DAY_MS`, used to compute the 30-day `expiresAt`.
- `src/modules/notifications/tests/factories.ts` – listed as a graph neighbor. The file itself doesn't show how the two relate.

## Notes
- Because it bypasses service logic, rows created through it are not subject to the cap or the live push.
- Pass `createdAt` to order rows deterministically in tests without waiting between inserts.
- The default `dedupeKey` and `expiresAt` depend on runtime values (a random ObjectId and `Date.now()`), so they differ on every call.
