---
source: src/infrastructure/persistence/command-metrics.ts
sha256: 24fbe5440bbcbecdcf200bea12212cde17791def4dd5c02d2033301d8a27444a
generated_at: 2026-10-29T02:11:54.685373+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/command-metrics.ts

## Purpose

Registers a single Prometheus histogram that records the latency of every MongoDB database command, labelled by collection, operation, and outcome. It hooks into the Node.js MongoDB driver's built-in command-monitoring events so that all commands (repository methods, direct model calls, aggregates) are captured without double-counting. Exists so `GET /observability/metrics/overview` can expose per-command duration percentiles.

## Key elements

- **`databaseOperationDuration`** (`Histogram`) — The exported Prometheus histogram. Labels: `collection`, `operation`, `outcome`. Buckets and name come from `histogramConfig(infrastructureMetricData.databaseOperationDuration)`. Registered on the shared `metricsRegistry`.
- **`observeDatabaseCommands(connection: Connection): void`** — Idempotent. Attaches `commandStarted` / `commandSucceeded` / `commandFailed` listeners to the underlying driver client. Tracks in-flight commands in a `Map<requestId, PendingCommand>` and calls `databaseOperationDuration.observe(...)` on completion. Safe to call multiple times; a `WeakSet` of already-observed clients prevents duplicate listeners.
- **`collectionOf(event)`** *(internal)* — Extracts the target collection from a `CommandStartedEvent`. Handles the `getMore` case (cursor id in the command's own key) and falls back to `'none'` for collection-less commands (`hello`, `endSessions`, `commitTransaction`).
- **`NO_COLLECTION`** — Sentinel label value `'none'` for commands that do not target a specific collection.
- **`PendingCommand`** — Minimal interface (`collection`, `operation`) stored between the started and finished events.

## Relationships

- **`metric-config.ts`** — Supplies `histogramConfig`, which provides the histogram name, help text, and bucket boundaries.
- **`metrics-registry.ts`** — Supplies the shared `metricsRegistry` (a `prom-client` Registry) on which the histogram is registered.
- **`metrics.generated.ts`** — Supplies the `infrastructureMetricData.databaseOperationDuration` definition (name, description, label list) consumed by `histogramConfig`.
- **`runtime/database.ts`** — The connection passed to `observeDatabaseCommands` must have been opened with the `COMMAND_MONITORING` flag; otherwise the driver never emits the events this module listens for.
- **`tests/integration/persistence/command-metrics.test.ts`** — Integration test that exercises `observeDatabaseCommands` against a real (or test) database connection.
- **`tests/support/database.ts`** — Test helper that opens a connection (presumably with command monitoring enabled) for the above test.
- **`tests/unit/infrastructure/runtime/database.test.ts`** — Unit tests for the runtime database module whose `COMMAND_MONITORING` flag is a prerequisite for this file to function.
- **`src/modules/observability/tests/unit/metrics-overview.test.ts`** — Tests the overview endpoint that reads `databaseOperationDuration`'s `_count` per label set.

## Notes

- **Idempotency guard:** The `WeakSet` tracks the *client* object, not the `Connection`. Calling `observeDatabaseCommands` with different `Connection` instances that share the same underlying client will not attach a second set of listeners.
- **Precondition:** If the connection was opened *without* `COMMAND_MONITORING`, `observeDatabaseCommands` will run without error but never record a sample. There is no runtime warning for this.
- **Duration unit:** The driver reports `event.duration` in milliseconds; this module divides by 1000 before calling `.observe()`, consistent with Prometheus' expectation of seconds.
- **Label cardinality:** `collection` and `operation` are bounded by the application's schema and the fixed set of MongoDB wire commands; `outcome` is always `success` or `error`. This keeps the time-series count predictable.
- **Naming convention:** The metric name follows OpenTelemetry database semantic conventions (`db.operation.duration`-style) so that stock dashboards (Grafana, etc.) can map to it without custom configuration.
