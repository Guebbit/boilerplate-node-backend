# docs/tools/testing-quickstart.md

## Purpose

A single-page quick reference for every test and benchmark command in the repo: what each answers, how long it takes, whether it's in the CI gate, and how to interpret failures. Intended as the first stop before drilling into individual layer documentation.

## Key elements

- **30-second version** — four commands covering the most common workflows (single module, all units, per-module report, full gate).
- **Command reference table** — 12 rows mapping each `npm run` script to the question it answers, approximate duration, and gate status.
- **Running one thing** — `test:module -- <path>` (8 suites / 92 tests example), Jest watch mode, and `--onlyChanged` usage with a mandatory `--runInBand` caveat.
- **Reading a failure** — output format of `test:report` (per-module table, slowest suites, failure list) and its dependency on a prior JSON-report run.
- **Five test layers** — unit, cross-cutting, integration, contract, fuzz: data source and what each uniquely catches.
- **Performance** — `bench` (autocannon, flat load) vs. `bench:k6` (k6, ramping load with pass/fail thresholds) vs. `bench:k6:checkout` (write-path under contention).

## Relationships

- **`docs/tools/testing-and-docs.md`** — linked as "Related"; this page points readers there for deeper coverage of the five layers and the underlying data. The report-script section also notes that a byte-identical copy of `test:report` exists in the paired frontend (Vitest JSON matches Jest `--json` shape), kept in sync by `npm run check:spec-identity`.

## Notes

- **`--runInBand` is non-negotiable.** Contract and integration suites share a single in-memory Mongo; running them in parallel produces failures that look like real bugs. Every script enforces this; manual `npx jest` invocations must repeat the flag.
- **`test:report` is read-only.** It parses a JSON file already written by `test:unit:report`. Without that file, the command has nothing to report. Coverage rows appear only if `coverage/lcov.info` exists (produced by `test:unit:coverage`).
- **k6 thresholds are placeholders.** The page explicitly instructs readers to seed them from a real `bench` p95 × 1.4 before trusting pass/fail verdicts.
- **`bench:k6:checkout` is destructive.** It creates orders and mutates stock; the page warns to point it at a throwaway DB and run `db:seed:reset` after.
- This is a documentation file, not executable code. All "commands" listed are npm scripts defined elsewhere (see `package-scripts.md` referenced in the Related section).
