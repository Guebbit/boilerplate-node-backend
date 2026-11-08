---
source: src/modules/notifications/tests/factories.ts
sha256: b4530f7dfec182b070e15eb6035e175176adc60319a8ffd1c7615fff16ebfa61
generated_at: 2026-11-08T06:34:51.913068+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/factories.ts

## Purpose

Test-persistence layer for notifications. The in-memory BUILDER (`makeNotification`) lives in `../factories.ts`; this file wraps it with a database write so integration and contract tests can create real documents. It also exposes a simple count helper for assertions that verify *nothing* was written.

## Key elements

- **`createNotification(overrides: NotificationOverrides): Promise<NotificationDocument>`** — Builds a notification via `makeNotification`, then persists it through `notificationRepository.create`. The `overrides` object carries the owner (`userId`) and any case-specific fields.
- **`countNotifications(): Promise<number>`** — Runs `notificationModel.countDocuments({})` with no filter; returns the total number of notification rows regardless of owner. Intended as a "nothing was written" guard in tests.

## Relationships

- **`src/modules/notifications/factories.ts`** — Provides the pure builder (`makeNotification`) and the `NotificationOverrides` type that this file delegates to before persisting.
- **`src/modules/notifications/repository.ts`** — Supplies `notificationRepository.create`, the single write path used here.
- **`src/modules/notifications/model.ts`** — Supplies `notificationModel` (for `countDocuments`) and the `NotificationDocument` return type.
- **Test consumers** (`tests/integration/service.test.ts`, `tests/integration/staff.test.ts`, `tests/contract/api.contract.test.ts`, `src/modules/shop-tasks/tests/integration/notices.test.ts`, `src/modules/shop-tasks/tests/integration/staff-notices.test.ts`, `tests/contract/ownership-contract.test.ts`, `tests/integration/erasure.test.ts`, `src/modules/account/tests/contract/shop.contract.test.ts`, `src/modules/account/tests/integration/export.test.ts`) — Import `createNotification` / `countNotifications` to seed or assert notification state in cross-module scenarios.

## Notes

- Do **not** import this file for unit tests that don't need a real DB row; use `makeNotification` from `../factories.ts` directly to stay in memory.
- `countNotifications` is intentionally unscoped (counts *all* documents). Use it only as a zero-check ("no new rows appeared"), not as a per-user assertion.
- The file is a `@module` (no default export); always named-import the two functions.
