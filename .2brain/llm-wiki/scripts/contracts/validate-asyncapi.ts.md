---
source: scripts/contracts/validate-asyncapi.ts
source_sha256: 82eed35ac2c09a6da1fc2431bb3f06f3134d6bc7d65df7e2a18603da90b747f9
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:00:46.571808+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/validate-asyncapi.ts

## Purpose
A standalone `tsx` CLI script that validates one or more AsyncAPI documents using `@asyncapi/parser` with its default Spectral ruleset (`spectral:asyncapi/recommended`). It replaces `asyncapi validate` from the removed `@asyncapi/cli`, keeping the same diagnostics while dropping the CLI's large install size and telemetry. It is run via `npm run lint:asyncapi`.

## Key elements
- `files`: the CLI arguments (`process.argv.slice(2)`). If empty, prints a usage message and exits with code 1.
- `parser`: a single `Parser` instance from `@asyncapi/parser` with default settings.
- `isInvalid(diagnostics)`: returns true if any diagnostic has `DiagnosticSeverity.Error`. Warnings and lower severities do not make a document invalid.
- Main `Promise.all` pipeline: reads each file with `readFileSync`, parses it with `{ source: file }` so diagnostics name the file, and prints `<file> is valid.` or `<file> has governance issues and is INVALID.`. If there are any diagnostics, it prints them with Spectral's `stylish` formatter (`failSeverity: Error`). Each file resolves to a boolean `invalid`.
- Final handlers: exits 1 if any file was invalid. Any thrown or rejected error is logged and also exits 1.

## Relationships
No graph neighbors. It depends only on the external packages `@asyncapi/parser` and `@stoplight/spectral-formatters`, plus Node's `fs`.

## Notes
- Files are validated in parallel, so output order follows completion order, not argument order.
- `readFileSync` runs inside the `files.map` callback. A missing or unreadable file throws synchronously there, before the `Promise.all` call finishes building, so it escapes the `.catch` handler and surfaces as an uncaught exception, not a handled error.
- The `DiagnosticSeverity` enum comparison carries an ESLint `no-unsafe-enum-comparison` suppression. The source explains that `@stoplight/spectral-core` nests its own copy of `@stoplight/types`, so there are two structurally identical but nominally distinct enums.
- The script keeps the exit-code contract of `asyncapi validate`: 0 when all files are valid, 1 otherwise.
