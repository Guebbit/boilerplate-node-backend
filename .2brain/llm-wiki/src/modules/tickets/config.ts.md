---
source: src/modules/tickets/config.ts
sha256: b6997a72d74b95dc26743994f9cfda18b0f7e260bc4bc0f4b04ffdbf85940c66
generated_at: 2026-10-29T06:00:49.576437+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/config.ts

## Purpose

Declares the runtime configuration surface for the tickets module: the fallback contact mailbox, ticket retention window, contact-message SLA, and the set of ship-to countries subject to FTC consent-reminder obligations. It exists so that every tickets-related constant lives in one typed, validated object rather than being scattered across services.

## Key elements

- **`ticketsConfig`** (exported const) — the sole export. Built via `defineConfig` with `name: 'tickets'` and four fields:
  - `NODE_CONTACT_NOTIFY_EMAIL` — free-text mailbox address (no default).
  - `NODE_TICKETS_RETENTION_DAYS` — integer, default **730**, minimum **1**.
  - `NODE_TICKETS_CONTACT_SLA_HOURS` — integer, default **48**, minimum **1**.
  - `NODE_TICKETS_FTC_COUNTRIES` — CSV list, upper-cased, default `['US','PR','GU','VI','AS','MP']`.

## Relationships

- **`src/infrastructure/config/define.ts`** — provides `defineConfig`, the factory that wraps the shape object and returns a validated config instance.
- **`src/infrastructure/config/fields.ts`** — provides the field-constructor helpers `text`, `int`, and `csv` used to declare types, defaults, and constraints.
- **`src/modules/tickets/module.ts`** — registers the tickets module; this config is the natural candidate for what it mounts on the module's DI container.
- **`src/modules/tickets/service.ts` / `services/system.ts`** — runtime consumers that read `ticketsConfig` values (SLA, retention, notify email, FTC country list) during ticket lifecycle operations.
- **`src/modules/tickets/model.ts`** — defines the ticket domain types that the configured values constrain (e.g., retention governs record lifecycle).

## Notes

- The `NODE_TICKETS_FTC_COUNTRIES` default encodes **16 CFR 435.2** (used-car mail-order rule) applicability; the comment references U.S. territories explicitly. Changing the default is a compliance-sensitive edit.
- `csv` fields are normalised to upper-case (`case: 'upper'`), so comparisons downstream should not re-normalise.
- All field names follow the `NODE_<MODULE>_<KEY>` convention shared with other modules; the `NODE_CONTACT_NOTIFY_EMAIL` name deliberately omits `TICKETS` because the mailbox is shared with the contact form outside this module.
