---
source: scenarios/support/doubles/register.ts
sha256: d01c00521b2991f96709fb88304bb1292e1a8d6c106bdf4b10c127d0df611ea7
generated_at: 2026-10-29T01:27:34.895189+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/register.ts

## Purpose

Central registration point that installs all test doubles into the application's resolver registries. It exists as a single, idempotent entry point so that both the dev preload script and the Jest setup can wire up fakes in one call, while staying outside `src/` so production code can never accidentally import it.

## Key elements

- **`registerDoubles`** (exported const, `() => void`) — The sole public export. Calls `registerModuleDoubles`, registers `logMailTransport` and `outboxMailTransport` under the keys `'log'` and `'outbox'`, and registers the webhook-sink exemption. Safe to call multiple times; registry entries are replaced, not duplicated.
- **Imports** — Pulls in the concrete doubles (`mail-log`, `mail-outbox`, `modules.generated`, `webhook-sink`) and the `registerMailTransport` function from the infrastructure adapter. Deliberately imports nothing heavy (no `nodemailer`, no payments module).

## Relationships

- **`scenarios/support/development-doubles.ts`** — Calls `registerDoubles` before the application loads in a dev/demo process.
- **`tests/support/setup.ts`** — Calls `registerDoubles` once per test file in the Jest environment.
- **`scenarios/support/doubles/mail-log.ts`** — Supplies `logMailTransport`, registered here under the `'log'` key.
- **`scenarios/support/doubles/mail-outbox.ts`** — Supplies `outboxMailTransport`, registered here under the `'outbox'` key.
- **`scenarios/support/doubles/modules.generated.ts`** — Supplies `registerModuleDoubles`, invoked first inside `registerDoubles`.
- **`scenarios/support/doubles/webhook-sink.ts`** — Supplies `registerWebhookSinkExemption`, invoked last inside `registerDoubles`.
- **`src/infrastructure/adapters/mail-transports.ts`** — Supplies the `registerMailTransport` registry function that this file uses to install mail doubles.

## Notes

- **Load-order constraint:** Both callers run *before* OpenTelemetry patches Express/Mongoose and before `jest.mock` hoisting. If a double (or its transitive imports) pulled in the payments module or `nodemailer` at module-evaluation time, both callers would break. Doubles that need such dependencies load them lazily on first invocation instead.
- **Idempotency:** `registerDoubles` can be called more than once (e.g., a test file that re-runs setup); entries in the registries are overwritten, not appended.
- **Not part of production:** The file lives under `scenarios/` and is intentionally outside the `src/` boundary so the production build graph can never reach it.
