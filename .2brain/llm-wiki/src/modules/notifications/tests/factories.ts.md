---
source: src/modules/notifications/tests/factories.ts
sha256: 353af200b148475f71d5bc2acb6ebbea68e4f818d1cf827e370c93ca5b20151f
generated_at: 2026-10-29T04:32:18.379777+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/factories.ts

## Purpose

Test-database persistence layer for notification fixtures. It exists to keep the pure in-memory builder (`makeNotification` in `../factories.ts`) separate from the act of writing a document into the test database, so tests can call one function and get a persisted `NotificationDocument` back.

## Key elements

- **`createNotification(overrides: NotificationOverrides): Promise<NotificationDocument>`** — Sole export. Builds a notification via `makeNotification(overrides)` and immediately persists it through `notificationRepository.create(...)`. The docstring notes the resulting record is past the cap and the live push.

## Relationships

- **`src/modules/notifications/factories.ts`** — Imports the builder (`makeNotification`) and the `NotificationOverrides` type. This file is the "persist" half of that pair.
- **`src/modules/notifications/repository.ts`** — Calls `notificationRepository.create()` to write the built document.
- **`src/modules/notifications/model.ts`** — Imports the `NotificationDocument` type, used as the return type of `createNotification`.
- **`src/modules/notifications/tests/contract/api.contract.test.ts`**, **`tests/integration/service.test.ts`**, **`tests/integration/staff.test.ts`** — Downstream consumers that call `createNotification` to seed the test database before exercising the API or service under test.

## Notes

- This file intentionally does **not** define the shape of a notification; it delegates all field defaults to `makeNotification`. Adding a new default field belongs in `../factories.ts`, not here.
- The one-line body means there is no transaction, retry, or cleanup logic — persistence failures propagate as a rejected promise to the caller.
