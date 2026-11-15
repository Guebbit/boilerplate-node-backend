---
source: scripts/audit/run-check-clean.ts
sha256: 1440a67f548c8615ebe5ab12c187cc4f34d2a6ed720c150b49398a600850399f
generated_at: 2026-11-14T17:21:39.600506+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/run-check-clean.ts

## Purpose

Thin CLI entry point for the audit tripwire (rule 6 in `scripts/audit/RULES.md`). It parses argv, delegates to `main` in `check-clean.ts`, and maps the returned code onto `process.exitCode` (0 clean, 1 changes listed, 2 bad usage). It exists so `npm run audit:check-clean` has a concrete script target with the correct shebang and argument-slicing boilerplate.

## Key elements

- **`#!/usr/bin/env tsx`** – shebang; the file is executed directly by tsx, not compiled.
- **`@module` JSDoc tag** – declares the file as a side-effect module (no exports).
- **`main` import** – the single import from `./check-clean`; all logic lives there.
- **`process.exitCode = main(process.argv.slice(2))`** – strips the two Node/tsx args, hands the remainder to `main`, and records the exit code (allows pending I/O to flush before the process terminates).

## Relationships

- **`scripts/audit/check-clean.ts`** – sole dependency. This file imports its `main` function and passes the CLI arguments through; every subcommand (`snapshot`, `compare`), flag (`--repo`), and exit-code decision is implemented there.

## Notes

- The current working directory is always audited; `--repo` flags *add* paths (e.g. the paired frontend) rather than replacing it.
- The tool is strictly post-hoc reporting — it never blocks or reverts a write.
- Because it assigns to `process.exitCode` rather than forcing immediate termination, any open handles (file reads, network) can drain before the process actually exits.
