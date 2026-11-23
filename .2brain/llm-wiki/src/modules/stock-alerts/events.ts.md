---
source: src/modules/stock-alerts/events.ts
source_sha256: 41310d34d7c39e827d1591e86b73f70ab6b8411087749eda6f0167f273eb54e0
context_sha256: 0dc3dc200768300490f98993e379f60e137acde699c46895acddfcd5e3261ee4
generated_at: 2026-11-22T07:54:08.648992+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/events.ts

## Purpose
Declares the domain event names emitted by the stock alerts module. Per its header comment, the events are declared in `./asyncapi.domain-events.yaml`. The file exists so emitters and listeners share a single spelling of each event name.

## Key elements
- `STOCK_ALERT_SENT`: constant equal to `'stock_alert.sent'`. It uses `satisfies DomainEventName`, so the compiler checks it against the kernel's event-name type while keeping the literal type.

## Relationships
- `src/kernel/events.ts`: provides the `DomainEventName` type, which is imported as a type only.
- `src/modules/stock-alerts/index.ts`, `src/modules/stock-alerts/service.ts`: neighbors in the dependency graph. The constant is documented as being shared between emitter and listeners. This file's content does not show which neighbor uses it.
- `src/modules/stock-alerts/tests/integration/stock-alerts.test.ts`, `tests/integration/draft-language-never-leaks.test.ts`: integration tests that are neighbors in the graph. The file content does not show how they use it.

## Notes
- Adding an event name here that is not a valid `DomainEventName` fails type-checking. The kernel's `DomainEventName` is the source of that constraint.
- The YAML file named in the header comment (`asyncapi.domain-events.yaml`) is the declared source of the event definitions. This file only holds the name constant.
