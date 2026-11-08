---
source: scripts/contracts/validate-asyncapi.ts
sha256: cba106292d1971aea14d16550541144e2a79b96ba57f81bc7d645b1b842dce1a
generated_at: 2026-11-08T02:45:15.226543+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/validate-asyncapi.ts

## Purpose

A CLI script that validates one or more AsyncAPI documents against the `@asyncapi/parser` default Spectral ruleset (`spectral:asyncapi/recommended`). It exists as a lightweight replacement for `asyncapi validate` now that `@asyncapi/cli` (~446 MB, telemetry) is no longer used. Invoked via `npm run lint:asyncapi`.

## Key elements

- **`isInvalid(diagnostics)`** — Returns `true` if any diagnostic carries `DiagnosticSeverity.Error`; the parser's own definition of "invalid."
- **Main flow (top-level `Promise.all`)** — Reads each CLI-arg file with `readFileSync`, calls `parser.parse(...)` in parallel, prints a per-file verdict line and (if diagnostics exist) a Spectral `stylish` report, then exits `1` if any file was invalid.
- **`Parser`** (from `@asyncapi/parser`) — Instantiated once with no options, so it uses the bundled `spectral:asyncapi/recommended` ruleset.
- **`stylish`** (from `@stoplight/spectral-formatters`) — Formats the diagnostic array into a grouped, human-readable block; `failSeverity` is set to `Error`.
- **Usage guard** — Exits `1` with a usage message when zero file arguments are supplied.

## Relationships

No graph neighbors. The script has no exports and is not imported by any other file; it is a leaf node invoked only from package-level `npm` scripts.

## Notes

- **Enum identity trap:** `@asyncapi/parser` re-exports a `DiagnosticSeverity` enum that originates from one nested copy of `@stoplight/types`, while `@stoplight/spectral-formatters` (and `spectral-core`) nest a *separate* copy. Comparing `diagnostic.severity === DiagnosticSeverity.Error` works at runtime because both enums are numeric, but TypeScript flags it as an unsafe enum comparison (hence the `eslint-disable` comment). Do not "simplify" this away.
- **Not a module:** The file is a `tsx` script (`#!/usr/bin/env tsx`). It has no exports and relies on side effects (console output, `process.exit`).
- **All-or-nothing exit code:** A single error-severity diagnostic in *any* supplied file causes exit code `1`, matching the old `asyncapi validate` contract. Warnings alone still exit `0`.
- **Synchronous I/O:** `readFileSync` blocks the event loop for each file before the async parse begins; fine for a CI lint script, not intended for high-volume use.
