---
source: tests/support/knobs.ts
sha256: a9e0c61fa2205392348e69a085b07cc4dd7dfbc3df276c4399207b77d50d6eb9
generated_at: 2026-11-08T09:56:32.013957+00:00
model: ollama:qwen3.8:27b
---

# tests/support/knobs.ts

## Purpose

Centralised depth knobs for all generative test suites (property, fuzz, race). Each export resolves an environment variable to a concrete count, so a single value can scale a suite up for a bug hunt or down to fit a weaker machine, without touching any test file. Nothing under `src/` reads these variables; they only control *what a suite asks*, never what production code does.

## Key elements

- **`countKnob(name, fallback, minimum)`** — Reads `process.env[name]` via `positiveInteger`, returns the parsed value clamped to `≥ minimum`, or `fallback` if the variable is unset or unparseable. Guarantees the result can never produce a vacuous (zero-case) suite.
- **`FUZZ_RUNS_PER_OPERATION`** (env `TEST_FUZZ_RUNS`, default 12, floor 1) — Number of fuzz requests per operation. Kept low by default because each request hits a real in-memory Mongo against finite auth limiters.
- **`PROPERTY_RUNS`** (env `TEST_PROPERTY_RUNS`, default 300, floor 10) — Cases per property over pure functions. Cheap (CPU-only); the first knob to lower on a RAM-constrained machine.
- **`PROPERTY_RUNS_WITH_DATABASE`** (env `TEST_PROPERTY_RUNS_DB`, default 40, floor 5) — Cases per property that drives a real database. Deliberately an order of magnitude below `PROPERTY_RUNS` because each case is a write sequence against Mongo, not a function call.

## Relationships

- **`scripts/testing/machine-budget.ts`** — Provides `positiveInteger`, the shared parser that `countKnob` delegates to for safe env-var → number conversion.
- **`tests/support/race.ts`** — Race harness whose participant count is governed by the same knob pattern; the module doc explicitly lists race participant count as one of the values these knobs control.
- **Property test suites** (`rates.property.test.ts`, `lifecycle.property.test.ts`, `totals.property.test.ts`, `money.property.test.ts`) — Pure-function property tests that consume `PROPERTY_RUNS` to size their case counts.
- **DB property/integration suites** (`ledger.property.test.ts`, `multi-line-reserve.property.test.ts`, `checkout-money-reconciliation.test.ts`) — Database-backed property tests that consume `PROPERTY_RUNS_WITH_DATABASE`.
- **`tests/fuzz/endpoints.fuzz.test.ts`** — Fuzz suite that consumes `FUZZ_RUNS_PER_OPERATION`.

## Notes

- **Floor, not zero.** Both an unparseable value *and* a parsed value below `minimum` are rejected in favour of the fallback or the floor respectively. A typo therefore yields the documented default, never a green zero-case run.
- **Two separate property knobs.** `PROPERTY_RUNS` and `PROPERTY_RUNS_WITH_DATABASE` are independent by design; scaling both from a single number would size the expensive DB suite by the cheap pure-function budget.
- **Env-var promotion.** `jest.config.js` whitelists exactly these variable names and sets them on the main process before any worker forks; the knobs file simply reads `process.env`.
- **Fuzz default is intentionally small.** Raising `TEST_FUZZ_RUNS` is an investigative act, not a routine setting, because each request multiplies against a real Mongo and finite auth limiters (see `tests/support/setup-environment.ts`).
