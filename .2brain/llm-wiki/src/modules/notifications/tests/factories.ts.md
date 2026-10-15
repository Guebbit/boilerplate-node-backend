---
source: src/modules/notifications/tests/factories.ts
sha256: c54fc82a6dd1f714e8d8b690822e93a94f75cc328ad9e605014af2d39a367531
generated_at: 2026-10-15T10:52:32.146351+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/factories.ts

## Purpose

Test-database persistence wrapper for the notifications module. It bridges the in-memory builder (`../factories.ts`) and the real repository so test suites can seed and query notification documents without re-implementing the persistence call.

## Key elements

- **`createNotification(overrides: NotificationOverrides): Promise<NotificationDocument>`** — Builds a notification via `makeNotification(overrides)` and persists it through `notificationRepository.create`. This is the only function that writes to the test database in this file.
- **Re-exports of `makeNotification` and `NotificationOverrides`** — Forwarded from `../factories` so test files can import the builder *and* the persistence helper from a single test-scoped path.

## Relationships

- **`src/modules/notifications/factories.ts`** (the BUILDER) — This file imports `makeNotification` / `NotificationOverrides` from it and re-exports both, acting as a thin persistence-on-top layer.
- **`src/modules/notifications/repository.ts`** — Provides `notificationRepository.create`, the sole write call inside `createNotification`.
- **`src/modules/notifications/model.ts`** — Supplies the `NotificationDocument` return type.
- **`src/modules/notifications/tests/integration/service.test.ts`** / **`src/modules/notifications/tests/contract/api.contract.test.ts`** — Downstream test consumers that rely on this file to seed database rows.

## Notes

- This file intentionally does **no** building logic; it delegates construction to `../factories.ts` and only handles the repository write. The module docblock makes this split explicit.
- The JSDoc on `createNotification` says "past the cap and the live push," implying the seeded document is meant to represent a notification that has already exceeded whatever cap/push threshold the service enforces.
