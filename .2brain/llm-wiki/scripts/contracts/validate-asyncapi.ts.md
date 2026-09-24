---
source: scripts/contracts/validate-asyncapi.ts
sha256: a4fb46e317ea4474b470b4e1b608086a1dc44ec31297e3230c66e30731bbf283
generated_at: 2026-09-23T17:23:11.007535+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/validate-asyncapi.ts

## Purpose

A lightweight CLI script that validates AsyncAPI documents using the `@asyncapi/parser` package and its default `spectral:asyncapi/recommended` ruleset. It exists as a drop-in replacement for the retired `asyncapi validate` command (from `@asyncapi/cli`), providing identical diagnostics without the ~446 MB dependency and its telemetry.

## Key elements

- **Entry point** — reads file paths from `process.argv.slice(2)`; exits with usage error if none are provided.
- **`isInvalid(diagnostics)`** — returns `true` if any diagnostic has `DiagnosticSeverity.Error`; the parser's own definition of "invalid."
- **Validation loop** — `Promise.all(files.map(...))` parses every file in parallel, prints a per-file status line (`is valid` / `has governance issues and is INVALID`), and renders diagnostics via `@stoplight/spectral-formatters` (`stylish`).
- **Exit contract** — exits `1` if any file is invalid or an exception is thrown; exits `0` otherwise. Mirrors the old CLI's behavior.

## Relationships

No graph neighbors. This is a self-contained script with no project-internal imports; its only dependencies are `@asyncapi/parser` and `@stoplight/spectral-formatters` (both external packages).

## Notes

- **Duplicate enum instances** — `@stoplight/spectral-core` (transitively under `@asyncapi/parser`) nests its own copy of `@stoplight/types`, distinct from the hoisted instance this file imports. Comparing the two enum values directly is type-safe at runtime but flagged by `@typescript-eslint/no-unsafe-enum-comparison`; the eslint-disable comment documents this.
- **Invoked via** `npm run lint:asyncapi` (per the header comment); the shebang (`#!/usr/bin/env tsx`) means it can also be run directly with `tsx`.
- **`source` option** — passed as `parser.parse(content, { source: file })` so diagnostics carry the file path rather than a generic label.
- The script is intentionally thin: no config loading, no custom rules, no caching. It relies entirely on the parser's built-in `recommended` ruleset.
