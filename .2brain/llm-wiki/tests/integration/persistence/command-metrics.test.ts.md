---
source: tests/integration/persistence/command-metrics.test.ts
sha256: 869d328d7696579179cf460d7fe82ef6526de42455db197d389553f00e70d2ca
generated_at: 2026-10-15T12:49:42.206035+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/command-metrics.test.ts

## Purpose
Integration test that verifies the `databaseOperationDuration` histogram correctly observes commands issued directly through the MongoDB driver (bypassing any repository layer), that each observation is tagged with the issuing collection, and that the `outcome` label distinguishes success from failure.

## Key elements
- **`observations(labels)`** – helper that reads the current `_count` value for a specific `{collection, operation, outcome}` label set from the `databaseOperationDuration` histogram via `databaseOperationDuration.get()`.
- **`"observes a direct Model.updateOne under its own collection"`** – performs a raw `leaseModel.updateOne(...)` and asserts the success counter for that collection/operation incremented by exactly 1.
- **`"records a rejected command with outcome error"`** – runs `leaseModel.collection.aggregate([{ $noSuchStage: {} }])`, expects the driver to reject, and asserts the error counter incremented by exactly 1.

## Relationships
- **`src/infrastructure/persistence/command-metrics.ts`** – exports `databaseOperationDuration`, the Prometheus histogram under test. The test reads its `.get()` output to assert counter values.
- **`src/infrastructure/persistence/lease.ts`** – exports `leaseModel`, whose `.collection` name is used as the `collection` label and whose methods (`updateOne`, `collection.aggregate`) are the driver calls that trigger metric observations.
- **`tests/support/setup-test-db.ts`** – provides `setupTestDb()`, called once at module scope to establish a real MongoDB connection before the suite runs.

## Notes
- This is a **real-driver** integration test: no mocks. It requires a running MongoDB instance reachable via the test setup.
- The error-case deliberately uses an **unknown pipeline stage** (`$noSuchStage`) because a duplicate-key insert returns `ok:1` with a write-error *inside* the reply, which the driver may classify differently from a true command failure (`ok:0`).
- Metrics are read through `databaseOperationDuration.get()` which returns a **Promise**, so every assertion is `await`ed.
