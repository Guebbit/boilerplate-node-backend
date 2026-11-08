---
source: src/modules/notifications/tests/unit/presenter.test.ts
sha256: 8c7df7b2d2c14ab19b795fd0872b852ae3acc71cbd42a3e8b31b6fccdae09fe5
generated_at: 2026-11-08T06:36:48.808495+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/presenter.test.ts

## Purpose
Unit tests for the notification presenter's wire contract: verifies that `presentNotification` and `presentNotifications` emit exactly the fields the API contract names (no more, no less), with correct serialization (IDs/dates as strings, `readAt` absent when unread) and per-code param pass-through.

## Key elements
- **`documentOf`** — helper that builds a minimal `NotificationDocument` stub (via `asStub`) containing only the fields the presenter actually reads, plus an override slot. Prevents accidental reliance on extra document fields.
- **`describe('presentNotification')`** — asserts the exact wire shape: field set, string serialization of `_id`/`createdAt`, and the read/unread `readAt` contract (property absent vs. ISO string).
- **`describe('presentNotification, per code')`** — parameterized test over every staff notification code verifying `code` and `params` pass through untouched; includes a **coverage meta-test** that the `bodies` array enumerates every key in `STAFF_ROUTES`; also checks `audience` round-trips for both `'own'` and `'staff'`.
- **`describe('presentNotifications')`** — asserts the list endpoint shape: results wrapped in `{ items: [...] }`, input order preserved, and empty input yields `{ items: [] }`.

## Relationships
- **`src/modules/notifications/presenter.ts`** — the unit under test; imports `presentNotification` and `presentNotifications`.
- **`src/modules/notifications/model.ts`** — supplies the `NotificationBody` and `NotificationDocument` types used to type the stub and the `bodies` fixture array.
- **`src/modules/notifications/staff-routing.ts`** — imports `STAFF_ROUTES`; the coverage test asserts the fixture list's codes match `Object.keys(STAFF_ROUTES)`, so a new route without a corresponding test row causes a failure.
- **`tests/support/stub.ts`** — imports `asStub`, used by `documentOf` to cast partial objects to the full document type.

## Notes
- The `documentOf` stub deliberately contains **only** the fields the presenter reads (plus one it must not leak). If the presenter starts reading a new field, the stub won't supply it and the test fails — an intentional guard against silent field coupling.
- The coverage test (`covers every code this module routes`) is the enforcement mechanism: adding a key to `STAFF_ROUTES` without adding a row to `bodies` breaks the build, ensuring every code's param shape gets an explicit assertion.
- `readAt` is asserted with `not.toHaveProperty` (absence), not `toBeUndefined` or `toBeNull` — the wire contract guarantees the key is missing, not present-with-null.
