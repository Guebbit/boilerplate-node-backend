---
source: tests/support/knobs.ts
sha256: 81df354da6cae0b56d0c859328fce19efdab0fc3da344fa1f9a061789bff7c12
generated_at: 2026-09-23T20:12:11.630997+00:00
model: ollama:qwen3.8:27b
---

# tests/support/knobs.ts

## Purpose

Centralizes the tunable "depth" parameters (how many cases a property test explores, how many fuzz requests per operation, how many race participants fire) for the generative test suites. Each value is read from an environment variable, floored to a minimum so a suite can never silently run zero cases, and defaulted to a committed constant when the variable is unset or unparseable. Exists so that a developer on a constrained machine can dial rigor down or hunt a specific bug by dialing it up without editing test files.

## Key elements

- **`countKnob(name, fallback, minimum)`** – Reads `process.env[name]` via `positiveInteger`, returns the parsed value clamped to `minimum`, or `fallback` when unset/unparseable. The single mechanism behind every exported constant.
- **`FUZZ_RUNS_PER_OPERATION`** (`TEST_FUZZ_RUNS`, default 12, min 1) – Requests thrown at each operation in the fuzz suite.
- **`PROPERTY_RUNS`** (`TEST_PROPERTY_RUNS`, default 300, min 10) – Cases per property over pure functions (no DB, no HTTP).
- **`PROPERTY_RUNS_WITH_DATABASE`** (`TEST_PROPERTY_RUNS_DB`, default 40, min 5) – Cases per property that drives a real Mongo sequence. Deliberately an order of magnitude lower than `PROPERTY_RUNS`.

## Relationships

- **Imports** `positiveInteger` from `scripts/testing/machine-budget.ts` for safe integer parsing.
- **Consumed by** the property test suites in `src/modules/delivery/tests/unit/rates.property.test.ts`, `src/modules/inventory/tests/integration/ledger.property.test.ts`, `src/modules/orders/tests/unit/money.property.test.ts`, and `src/modules/orders/tests/unit/totals.property.test.ts` (they read `PROPERTY_RUNS` or `PROPERTY_RUNS_WITH_DATABASE`).
- **Consumed by** `tests/fuzz/endpoints.fuzz.test.ts` (reads `FUZZ_RUNS_PER_OPERATION`) and `tests/support/race.ts` (participates in the race-count decision).
- The environment variables it reads are promoted into the main process by `jest.config.js` before worker forks; nothing under `src/` reads them.

## Notes

- `PROPERTY_RUNS` and `PROPERTY_RUNS_WITH_DATABASE` are separate knobs on purpose: scaling the expensive DB-backed suite from the cheap pure-function budget would mis-size it.
- The `minimum` floor is not just defensive—`numRuns: 0` or a race of one participant would be a vacuously green test, so both are made unreachable.
- A typo in the env var name (or a non-integer value) silently falls back to the committed default rather than crashing; the suite runs, just at the default depth.
