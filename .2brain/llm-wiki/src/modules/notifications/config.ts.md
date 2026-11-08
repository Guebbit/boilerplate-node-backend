---
source: src/modules/notifications/config.ts
sha256: 7e207c75df3bb806e5d55494a2cdea2f7a4fe2c6f6a5319cddee109e6d09099c
generated_at: 2026-11-08T06:30:13.068255+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/config.ts

## Purpose

Declares the runtime configuration knobs for the notifications module: how many inbox notifications a user retains, and how many staff work-notice items are kept alongside a staff member (and for how long). It exists so these limits live in one typed, validated place rather than being scattered across services.

## Key elements

- **`notificationsConfig`** (exported const) — The sole export. A `defineConfig` object named `"notifications"` with three integer fields, each constrained to a minimum of 1:
  - `NODE_NOTIFICATIONS_MAX_PER_USER` — per-user inbox cap (default 100).
  - `NODE_NOTIFICATIONS_STAFF_MAX_PER_USER` — per-user staff-notice cap, kept separate from the inbox cap so a refund storm cannot evict a user's own messages (default 200).
  - `NODE_NOTIFICATIONS_STAFF_TTL_DAYS` — lifetime of a staff work notice before expiry (default 30 days).

## Relationships

- **`src/infrastructure/config/define.ts`** — Supplies `defineConfig`, the builder that turns the shape object into a validated config instance.
- **`src/infrastructure/config/fields.ts`** — Supplies the `int` field descriptor (default/min validation).
- **`src/modules/notifications/module.ts`** — Registers `notificationsConfig` so the module can expose it to the application config system.
- **`src/modules/notifications/services/inbox.ts`** — Reads `NODE_NOTIFICATIONS_MAX_PER_USER` to enforce inbox retention.
- **`src/modules/notifications/services/staff.ts`** — Reads the two `STAFF_*` fields to govern staff-notice volume and TTL.

## Notes

- The staff cap is intentionally a *separate* counter from the user inbox cap (see the inline comment). Treating them as one pool is a bug.
- All three values are integers with a hard floor of 1; setting them to `0` will be rejected at config-parse time.
- Values are referenced by their `NODE_*` env-var names, so deployment overrides go through environment variables, not code edits (see `docs/tools/configuration.md` referenced in the module docstring).
