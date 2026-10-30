---
source: src/modules/notifications/config.ts
sha256: 11fbb7bd63f409cddcf20fadedff16bbc2fd03d40188fb7403ae0777c78f0704
generated_at: 2026-10-29T04:27:23.990315+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/config.ts

## Purpose

Declares the single configuration surface for the notifications module: retention caps for user and staff inboxes, staff notice lifetime, and the time-based thresholds that drive the daily digest and various staff workflow reminders. All values are typed integers with a minimum of 1 and sensible defaults, making the module's tunable knobs discoverable in one place.

## Key elements

- **`notificationsConfig`** — The sole export. A `defineConfig` object named `"notifications"` with the following fields:
  - `NODE_NOTIFICATIONS_MAX_PER_USER` (default 100) — Cap on how many notifications a regular user retains.
  - `NODE_NOTIFICATIONS_STAFF_MAX_PER_USER` (default 200) — Separate, higher cap for staff so a refund burst can't evict their own messages.
  - `NODE_NOTIFICATIONS_STAFF_TTL_DAYS` (default 30) — Lifetime of a staff work notice before it expires.
  - `NODE_STAFF_TRANSFER_DUE_HOURS` (default 24) — Hours a transfer sits before the digest counts it as overdue.
  - `NODE_STAFF_HOLD_OPEN_DAYS` (default 3) — Days a hold remains open before being flagged.
  - `NODE_STAFF_RETURN_DECISION_DAYS` (default 3) — Days for a return decision before the digest nudges.
  - `NODE_STAFF_UNSHIPPED_DAYS` (default 3) — Days unshipped before appearing in the digest.
  - `NODE_STAFF_TRACKING_MISSING_HOURS` (default 24) — Hours with no tracking update before a reminder.
  - `NODE_DELIVERY_UNDELIVERED_REMINDER_DAYS` (default 14) — Days undelivered before a reminder fires.

## Relationships

- **`src/infrastructure/config/define.ts`** — Supplies `defineConfig`, the factory that validates and names the config block.
- **`src/infrastructure/config/fields.ts`** — Supplies the `int` field descriptor used to type every entry (enforces integer + `min: 1`).
- **`src/modules/notifications/module.ts`** — Registers `notificationsConfig` so the module loader knows which config slice this module consumes.
- **`src/modules/notifications/services/inbox.ts`** — Reads `NODE_NOTIFICATIONS_MAX_PER_USER` and `NODE_NOTIFICATIONS_STAFF_MAX_PER_USER` to enforce retention caps and `NODE_NOTIFICATIONS_STAFF_TTL_DAYS` for expiration.
- **`src/modules/notifications/services/digest.ts`** — Reads the time-based `NODE_STAFF_*` and `NODE_DELIVERY_*` thresholds to decide which items are overdue and included in the daily digest.
- **`src/modules/notifications/services/staff.ts`** — Reads staff-specific thresholds (TTL, hold/return/unshipped/tracking) to drive work-notice lifecycle logic.

## Notes

- Every field is `min: 1`; a value of 0 is invalid and will be rejected at config-load time.
- The staff cap (`STAFF_MAX_PER_USER`) is intentionally separate from the user cap so that a high-volume user (e.g. a refund storm) cannot push a staff member's own notifications out of their window.
- The `NODE_STAFF_*` and `NODE_DELIVERY_*` keys look like they belong to a broader "staff" or "delivery" domain, but they are scoped here because the daily digest is the consumer that acts on them.
- See `docs/tools/configuration.md` for operational guidance on overriding these values in deployment environments.
