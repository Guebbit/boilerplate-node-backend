---
source: src/infrastructure/persistence/command-metrics.ts
source_sha256: 1e7c7eee0e92a31f167bb8c02250a25bb100fc300794f0c89b73011824f02c83
context_sha256: 44998f4fadbb0819cd3864fc3cb4f299108207d196932ad1887b367bd0d87e1c
generated_at: 2026-11-22T03:01:29.490093+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/command-metrics.ts

## Purpose
Records MongoDB command latency as a Prometheus histogram, fed by the MongoDB driver's own command-monitoring events. Because the driver sees every command regardless of origin (repository method, direct `Model.updateOne`, aggregate), nothing is double-counted or missed. `GET /observability/metrics/overview` reads the histogram's `_count` by name.

## Key elements
- `databaseOperationDuration`: a `prom-client` `Histogram` registered on `metricsRegistry`. Its config comes from `histogramConfig(infrastructureMetricData.databaseOperationDuration)`. It is labelled by `collection`, `operation` and `outcome` (`success` or `error`), and named after the OpenTelemetry database semantic conventions.
- `observeDatabaseCommands(connection)`: attaches `commandStarted`, `commandSucceeded` and `commandFailed` listeners to the connection's client. It is idempotent.
- `PendingCommand` (internal): the `{ collection, operation }` captured at start and held until the command finishes.
- `collectionOf(event)` (internal): returns the string under the command's own name (e.g. `{ find: 'users' }`). For `getMore` it falls back to `command.collection`, and otherwise returns `'none'`.
- `NO_COLLECTION` (internal): the `'none'` label, used for commands such as `hello`, `endSessions` and `commitTransaction`.
- `observed` (internal): a `WeakSet` of clients that already have listeners.

## Relationships
- `src/infrastructure/observability/metrics-registry.ts`: supplies `metricsRegistry`, where the histogram is registered.
- `src/infrastructure/observability/metric-config.ts`: supplies `histogramConfig`, which builds the histogram's configuration from the metric data passed to it.
- `src/infrastructure/runtime/database.ts`: opens the connection. It must enable `COMMAND_MONITORING`, or no events fire.
- Tests:
  - `tests/integration/persistence/command-metrics.test.ts` covers this file directly.
  - `src/modules/observability/tests/unit/metrics-overview.test.ts` covers the overview endpoint that reads the histogram's `_count`.
  - `tests/support/database.ts` and `tests/unit/infrastructure/runtime/database.test.ts` cover the database setup this relies on.

## Notes
- Each command's `requestId` is stored in a `pending` map at start and removed on both success and failure, so the map holds only in-flight commands. If `finish` finds no matching start, it records nothing.
- The driver's `event.duration` is in milliseconds. The code divides it by 1000 before observing, so the metric is in seconds.
- `pending` is created per connection inside `observeDatabaseCommands`, and the `WeakSet` is keyed on the client. Calling `start()` again therefore does not add a second listener.
- Label cardinality is bounded by the schema (collections) and the driver's command set (operations).
