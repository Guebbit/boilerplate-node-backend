---
source: tests/integration/persistence/command-metrics.test.ts
sha256: 869d328d7696579179cf460d7fe82ef6526de42455db197d389553f00e70d2ca
generated_at: 2026-11-08T09:44:16.049765+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/command-metrics.test.ts

## Purpose

Integration test proving that the `databaseOperationDuration` Prometheus histogram observes raw MongoDB driver commands issued directly on a `Model` (bypassing every repository), attributes them to the correct collection, and distinguishes success from failure via the `outcome` label.

## Key elements

- **`observations(labels)`** – Helper that reads the live metric registry, finds the `db_client_operation_duration_seconds_count` sample matching the given `{ collection, operation, outcome }` labels, and returns its count (0 if absent). Used to snapshot before/after a command.
- **`'observes a direct Model.updateOne under its own collection'`** – Issues `leaseModel.updateOne(...)` and asserts the success counter for that collection increments by exactly 1.
- **`'records a rejected command with outcome error'`** – Runs `leaseModel.collection.aggregate([{ $noSuchStage: {} }]).toArray()`, expects it to reject, and asserts the error counter for that collection increments by exactly 1.

## Relationships

- **`src/infrastructure/persistence/command-metrics.ts`** – Provides `databaseOperationDuration`, the histogram under test. The test reads its `.get()` sample list to verify counts.
- **`src/infrastructure/persistence/lease.ts`** – Provides `leaseModel`, the concrete Mongoose model whose `.collection` and static methods are used to emit the commands being measured.
- **`tests/support/setup-test-db.ts`** – Provides `setupTestDb()`, called once at module scope to establish the real driver connection the metrics middleware hooks into.

## Notes

- The error-case test deliberately uses an unknown pipeline stage (`$noSuchStage`) because the driver reports that as `ok:0` (a hard command failure). A duplicate-key insert would produce `ok:1` with an embedded write error—a different failure path that exercises different driver internals.
- The test targets the histogram's `_count` metric specifically; it does not assert on bucket boundaries or the sum.
- `setupTestDb()` is called at module level (outside `describe`), so the driver connection (and its metrics middleware) exists before any test runs.
