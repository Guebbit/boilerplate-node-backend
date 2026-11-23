---
source: src/modules/notifications/tests/factories.ts
source_sha256: b4530f7dfec182b070e15eb6035e175176adc60319a8ffd1c7615fff16ebfa61
context_sha256: 9c174982adf3830e211abc6237638afbcf88b83a772ef3e6add0b9f266d0451f
generated_at: 2026-11-22T05:57:19.352569+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/tests/factories.ts

## Purpose
Database-touching test factories for the notifications module. The pure builder (`makeNotification`) lives one level up in `src/modules/notifications/factories.ts`; this file only persists what it returns and offers a count helper for assertions.

## Key elements
- `createNotification(overrides)` — builds a notification via `makeNotification(overrides)` and saves it with `notificationRepository.create`, returning a `Promise<NotificationDocument>`. `overrides` must identify the owner (`userId`). Per its doc comment, it persists "past the cap and the live push".
- `countNotifications()` — returns the total number of notifications in the collection (`notificationModel.countDocuments({})`), regardless of owner. Tests use it to prove that nothing was written.

## Relationships
- Imports `makeNotification` and the `NotificationOverrides` type from `src/modules/notifications/factories.ts` (the builder).
- Imports `notificationRepository` from `src/modules/notifications/repository.ts` to persist, and `notificationModel` / `NotificationDocument` from `src/modules/notifications/model.ts` to count and type results.
- Used as a test helper by notifications tests (`src/modules/notifications/tests/contract/api.contract.test.ts`, `src/modules/notifications/tests/integration/service.test.ts`, `src/modules/notifications/tests/integration/staff.test.ts`), by account tests (`shop.contract.test.ts`, `export.test.ts`), by shop-tasks tests (`notices.test.ts`, `staff-notices.test.ts`), and by the cross-module `tests/contract/ownership-contract.test.ts` and `tests/integration/erasure.test.ts`.

## Notes
- Keep the builder and persistence separate: put pure construction logic in `src/modules/notifications/factories.ts` and DB-touching code here.
- `countNotifications` is global, not per user, so it is suited to "nothing was created" assertions rather than per-owner counts.
