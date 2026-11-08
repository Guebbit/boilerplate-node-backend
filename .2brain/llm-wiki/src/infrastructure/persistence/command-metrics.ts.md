---
source: src/infrastructure/persistence/command-metrics.ts
sha256: 24fbe5440bbcbecdcf200bea12212cde17791def4dd5c02d2033301d8a27444a
generated_at: 2026-11-08T03:41:55.574883+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/command-metrics.ts

## Purpose

Wires the MongoDB driver's built-in command-monitoring events into a Prometheus histogram so that every database command's latency is recorded once, regardless of the code path that issued it (repository method, direct model call, aggregation, etc.). The resulting `database_operation_duration` metric feeds the `GET /observability/metrics/overview` endpoint and is named per OpenTelemetry database semantic conventions for drop-in dashboard compatibility.

## Key elements

- **`databaseOperationDuration`** (exported `Histogram`) – The single metric. Labels: `collection`, `operation`, `outcome`. Registered in the shared `metricsRegistry`.
- **`observeDatabaseCommands(connection)`** (exported) – Attaches `commandStarted` / `commandSucceeded` / `commandFailed` listeners to the underlying MongoClient. Idempotent (guarded by a `WeakSet`). Must be called after the connection is open and was configured with `COMMAND_MONITORING`.
- **`collectionOf(event)`** (internal) – Resolves the target collection from a `CommandStartedEvent`; handles the `getMore` shape where the collection lives under `event.command.collection` rather than under the command name.
- **`PendingCommand`** (internal interface) – Stashes `collection` + `operation` between `commandStarted` and the terminal event, keyed by the driver's `requestId`.
- **`NO_COLLECTION`** – Fallback label (`'none'`) for commands like `hello`, `endSessions`, `commitTransaction` that target no collection.

## Relationships

- **`metrics-registry.ts`** – The histogram is registered here; the registry is the single scrape target for all Prometheus metrics.
- **`metric-config.ts`** – Supplies `histogramConfig()` (bucket boundaries, common options) spread into the histogram constructor.
- **`metrics.generated.ts`** – Provides the typed `infrastructureMetricData.databaseOperationDuration` name/label metadata used by `histogramConfig`.
- **`runtime/database.ts`** – The connection produced here must be opened with the `COMMAND_MONITORING` option; `observeDatabaseCommands` is expected to be called on that connection during bootstrap.
- **`tests/integration/persistence/command-metrics.test.ts`** – Integration test exercising the full event→histogram path against a real (or test) MongoDB.
- **`tests/support/database.ts`** – Test helper that creates a `COMMAND_MONITORING`-enabled connection, mirroring the runtime setup.
- **`tests/unit/infrastructure/runtime/database.test.ts`** – Unit test for the runtime connection factory; relevant because it verifies the `COMMAND_MONITORING` flag is set.
- **`src/modules/observability/tests/unit/metrics-overview.test.ts`** – Verifies the overview endpoint reads this histogram's `_count` by name.

## Notes

- **Idempotency:** A `WeakSet<object>` (`observed`) tracks clients that already have listeners attached, so calling `observeDatabaseCommands` twice on the same connection is a safe no-op. Without this guard a second call would double-count every command.
- **Duration units:** The driver reports `duration` in **milliseconds**; the code divides by 1000 before calling `.observe()`, since Prometheus expects seconds.
- **`getMore` quirk:** For a `getMore` command the `command` object's own key holds a cursor id, not the collection name. `collectionOf` falls back to `event.command.collection` for this case.
- **Label cardinality:** The three labels are intentionally bounded (fixed set of operations, schema-defined collections, two outcomes) to keep the series count low.
- **Prerequisite:** If the connection was *not* opened with `COMMAND_MONITORING`, no events ever fire and this module silently records nothing. There is no runtime warning for this misconfiguration.
