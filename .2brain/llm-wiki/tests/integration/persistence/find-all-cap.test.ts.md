---
source: tests/integration/persistence/find-all-cap.test.ts
sha256: de0177f70740271ec6bd067d04a8048886a4e88ef9cdb2add06335e10e48efeb
generated_at: 2026-11-15T00:23:18.146882+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/find-all-cap.test.ts

## Purpose

Integration test verifying that `findAll` with no caller-supplied `limit` stops at 1000 rows (the DoS backstop documented in `docs/theory/defences/denial-of-service.md`), that an explicit limit overrides that ceiling, and that `findByIds` is exempt from the cap while still validating IDs. Uses a minimal scratch model so the assertion targets the repository factory, not any domain module.

## Key elements

- **`Probe` / `probeModel`** — Mongoose schema with a single `n: number` field, registered as `FindAllCapProbe`. Exists solely to give the repository something to query.
- **`probes`** — Repository instance produced by `createRepository<Probe, Wire<Probe>>(probeModel, …)` with an identity `transform` and empty `searchable`. This is the SUT.
- **`describe('findAll without a limit')`** — Two tests: (1) inserting 1001 docs yields exactly 1000 rows; (2) passing `{ limit: 1001 }` returns all 1001.
- **`describe('findByIds')`** — Two tests: (1) requesting all 1001 inserted IDs returns all of them (no cap); (2) a non-hex string like `'not-an-id'` causes a rejection rather than a silent drop.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — The system under test. The test imports `createRepository` and the `Wire` type; all assertions are about behavior that factory implements.
- **`tests/support/setup-test-db.ts`** — Called once at module top-level (`setupTestDb()`) to start a clean in-memory MongoDB instance before any test in this file runs.

## Notes

- Each test block re-inserts 1001 documents without clearing the collection first; the suite relies on `setupTestDb` providing a fresh database per file, not per test. If this file is ever split or another suite shares the same model name (`FindAllCapProbe`), results can bleed.
- The 1001-row figure is deliberate: it is exactly one past the 1000 ceiling, so an off-by-one in the cap logic would let all rows through and the test would catch it.
- `findByIds` rejection test expects a *thrown* rejection (`rejects.toThrow()`), not an empty result — malformed IDs are a hard error, not a silent filter.
