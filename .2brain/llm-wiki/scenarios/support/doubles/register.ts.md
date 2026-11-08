---
source: scenarios/support/doubles/register.ts
sha256: d01c00521b2991f96709fb88304bb1292e1a8d6c106bdf4b10c127d0df611ea7
generated_at: 2026-11-08T02:34:40.084380+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/register.ts

## Purpose

Single registration point that populates the application's runtime registries with test doubles (fake mail transports, module fakes, webhook-sink exemptions). It exists so that dev, demo, and test processes can swap real I/O for fakes through one function call. Production never imports this file — it lives outside `src/` by design.

## Key elements

- **`registerDoubles()`** — the sole export. Orchestrates all double registrations in one call: calls `registerModuleDoubles()` (from `./modules.generated`), registers the `log` and `outbox` mail transports into the `mail-transports` registry, and registers the webhook-sink exemption. Idempotent: a repeated call replaces the registry entry rather than duplicating it.

## Relationships

- **`src/infrastructure/adapters/mail-transports.ts`** — provides `registerMailTransport`, the registry function this file writes into. This module imports *only* that function; it does not pull in `nodemailer` or other transport dependencies.
- **`scenarios/support/doubles/mail-log.ts`** — exports `logMailTransport`, which this file registers under the `'log'` key.
- **`scenarios/support/doubles/mail-outbox.ts`** — exports `outboxMailTransport`, registered under the `'outbox'` key.
- **`scenarios/support/doubles/webhook-sink.ts`** — exports `registerWebhookSinkExemption`, called during registration.
- **`scenarios/support/development-doubles.ts`** — calls `registerDoubles()` as a dev/demo preload step before the application boots.
- **`tests/support/setup.ts`** — calls `registerDoubles()` once per test file in the Jest environment.

## Notes

- **Load-order constraint:** both callers execute *before* OpenTelemetry patches `express`/`mongoose` and before `jest.mock` hoisting. Any double that transitively imports a heavy module (e.g. payments) at import time would break both callers. Doubles that need such modules must lazy-load them on first invocation, not at module top-level.
- **Deliberately side-effect-free on import:** importing this file has no effect; only calling `registerDoubles()` mutates registries.
- **`./modules.generated`** is imported but not listed as a graph neighbor here; it is a generated artifact that registers per-module doubles.
