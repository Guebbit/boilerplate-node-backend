---
source: src/modules/notifications/config.ts
source_sha256: cb117e9bc880a70159b2ff739a869c3da1151369b261b627bd90db93fadc8957
context_sha256: 825292be573a193b327d34ddcaee410d5e415d26cd35d77fa6b7e2e7cc482d5f
generated_at: 2026-11-22T05:52:38.032124+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/config.ts

## Purpose
Declares the notifications module's configuration: how many notifications a user keeps in their inbox, and how many staff "work notices" a staff member keeps alongside them, plus how long those notices live. Values come from environment variables, validated and given defaults by the shared config infrastructure.

## Key elements
- `notificationsConfig`: the module's config, built with `defineConfig` under the name `'notifications'`. Its shape has three integer fields, each with `min: 1`:
  - `NODE_NOTIFICATIONS_MAX_PER_USER` (default `100`): cap on a user's notifications.
  - `NODE_NOTIFICATIONS_STAFF_MAX_PER_USER` (default `200`): separate cap for staff work notices. It is kept apart from the cap above so a burst of work notices (the source comment's example is a "refund storm") cannot push a person's own messages out.
  - `NODE_NOTIFICATIONS_STAFF_TTL_DAYS` (default `30`): lifetime of staff work notices, in days.

## Relationships
- `src/infrastructure/config/define.ts`: supplies `defineConfig`, which this file uses to declare the config.
- `src/infrastructure/config/fields.ts`: supplies the `int` field builder used for each setting.
- `src/modules/notifications/module.ts`: listed as a graph neighbor of this file. The file itself does not show how it consumes the config.

## Notes
- The TTL is expressed in days, and all three limits must be at least 1.
