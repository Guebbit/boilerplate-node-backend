# docs/tools/testing-quickstart.md

## Purpose

A single-reference cheat sheet for every test and benchmark command in the repo: what each answers, how long it takes, whether it is a CI gate, and the correct flags to use. It exists so a developer (or AI assistant) can pick the right command in under a minute without reading the full package-scripts reference.

## Key elements

- **30-second command set** — the four most common invocations (`test:module`, `test:unit`, `test:report`, `complete`).
- **Full command table** — 13 rows mapping each `npm run` script to its question, runtime, and gate status (✅ / ❌).
- **Running one thing** — `test:module -- <path>`, Jest `--watch`, and `--onlyChanged` patterns, each with the mandatory `--runInBand` caveat.
- **Reading a failure** — how `test:report` parses the Jest JSON report (produced by `test:unit:report`) into per-module summaries, slowest suites, and failure listings; optional coverage rows from `lcov.info`.
- **Five test layers table** — unit, cross-cutting, integration, contract, fuzz; each with its data source and what it structurally catches.
- **Performance section** — `bench` (autocannon, flat load) vs. `bench:k6` (ramping load with pass/fail thresholds); note that `k6/*.js` thresholds are placeholders to be seeded from a real measurement (~1.4× p95).
- **`bench:k6:checkout` warning** — it writes real orders and mutates stock; requires a throwaway DB and a subsequent `db:seed:reset`.

## Relationships

- **docs/tools/package-scripts.md** — the full annotated list of every `package.json` script; this page links to it for "every script, annotated."
- **docs/tools/testing-and-docs.md** — deeper coverage of the five test layers, fixtures, and the data behind them; linked as the next-read page.
- **docs/tools/mutation-testing.md** — the `test:mutation` script (nightly, minutes-long) is only summarized here; that page covers the tool's configuration and interpretation.
- **docs/tools/mongodb-mongoose.md** — integration tests use an in-memory Mongo via `tests/support/setup-test-db.ts`; that page documents the demo-data seeding and connection setup referenced here.

## Notes

- **`--runInBand` is non-optional.** The contract and integration suites share a database. Dropping this flag (e.g., with `--onlyChanged` in a bare `npx jest` call) causes parallel DB access that produces failures indistinguishable from real bugs.
- **`test:report` needs a JSON file on disk.** It does not run tests itself; `test:unit:report` must have been executed in the same session first.
- **Frontend parity.** The `test-report` script has a byte-identical Vitest counterpart in the paired frontend repo; `npm run check:spec-identity` enforces that the two copies stay in sync.
- **k6 thresholds are intentionally loose.** They are regression guards, not SLA targets. Setting them too tight makes the suite fire on normal variance, training the team to ignore it.
- **`test:prism` is not a gate.** It lives under `complete:manual` and is meant for spec-authoring loops, not CI.
