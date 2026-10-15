---
source: tests/support/knobs.ts
sha256: a9e0c61fa2205392348e69a085b07cc4dd7dfbc3df276c4399207b77d50d6eb9
generated_at: 2026-10-15T12:59:04.493487+00:00
model: ollama:qwen3.8:27b
---

# tests/support/knobs.ts

## Purpose

Centralises the depth/iteration knobs that generative test suites read from environment variables. By giving every suite a single, floored, documented way to ask "how hard do you want me to work?", the file lets a weak machine trade rigour for runtime (or a developer turn a specific knob up while hunting a bug) without touching suite code. No production code under `src/` reads these values — they only change what a suite *asks*, never what the code *answers*.

## Key elements

- **`countKnob(name, fallback, minimum)`** — Resolves an environment variable to a positive integer. Unset or unparseable values fall back to the committed default; a valid but too-small value is clamped to `minimum` so no suite can silently run zero cases.
- **`FUZZ_RUNS_PER_OPERATION`** (`TEST_FUZZ_RUNS`, default 12, floor 1) — Iterations per fuzzed operation against a real in-memory Mongo instance. Deliberately small; raise only when hunting.
- **`PROPERTY_RUNS`** (`TEST_PROPERTY_RUNS`, default 300, floor 10) — Cases per property over pure functions (no DB, no HTTP). The last knob worth turning down on a RAM-constrained machine.
- **`PROPERTY_RUNS_WITH_DATABASE`** (`TEST_PROPERTY_RUNS_DB`, default 40, floor 5) — Cases per property that drives a real database. Kept an order of magnitude below `PROPERTY_RUNS` because each case is a write sequence against Mongo, not a function call.

## Relationships

- **`scripts/testing/machine-budget.ts`** — Imported for the `positiveInteger` parser that `countKnob` delegates to for type-safe env reads.
- **`tests/unit/shared-kernel/money.property.test.ts`, `src/modules/delivery/tests/unit/rates.property.test.ts`, `src/modules/orders/tests/unit/totals.property.test.ts`** — Pure-function property suites that consume `PROPERTY_RUNS`.
- **`src/modules/inventory/tests/integration/ledger.property.test.ts`, `src/modules/inventory/tests/integration/multi-line-reserve.property.test.ts`, `tests/integration/checkout-money-reconciliation.test.ts`** — Database-backed property suites that consume `PROPERTY_RUNS_WITH_DATABASE`.
- **`tests/fuzz/endpoints.fuzz.test.ts`** — Fuzz suite that consumes `FUZZ_RUNS_PER_OPERATION`.
- **`tests/support/race.ts`** — Referenced in the module doc as the other consumer of a depth knob ("how many participants a race fires").

## Notes

- Environment variables are promoted into the main Jest process by `jest.config.js` reading `.env` before worker forks; workers inherit them.
- The floor is intentional: `numRuns: 0` or a race of one participant would produce a green test that tested nothing, so the minimum guarantees at least one real case.
- `PROPERTY_RUNS` and `PROPERTY_RUNS_WITH_DATABASE` are deliberately separate knobs; do not consolidate them into a single variable, as that would size the expensive DB suite by the cheap pure-function budget.
- See `docs/tools/property-testing.md` and `docs/tools/fuzz-testing.md` for tuning guidance.
