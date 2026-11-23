---
source: scripts/cli.ts
source_sha256: 62b72942da23f7e6140d0f905ceea47d6a2a56640327f52c2f9ad5b6f9bb0edf
context_sha256: 89ca683265faf54e769e338e1d834071ae626419a61c3c29bccb5bf599f26868
generated_at: 2026-11-22T01:52:29.012933+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/cli.ts

## Purpose
Small command-line helper for scripts. It reads `--flag value` and `--flag=value` arguments through `node:util`'s `parseArgs`, so individual scripts don't need their own `indexOf`/`startsWith` parsing. Parsing is lenient (`strict: false`): unknown flags and positionals are ignored, which matches how `npm run x -- --flag` passes extra flags that npm itself adds.

## Key elements
- `flagValue(flag)`: returns the string value of `--flag`, or `undefined` if the flag is absent or has no value.
- `hasFlag(flag)`: returns `true` when the boolean switch `--flag` was passed.
- `requiredPath(flag, root)`: returns the flag's value resolved to an absolute path with `path.resolve(root, value)`. If the flag is missing, it prints `Missing required argument: --<flag> <path>` to stderr and exits with code 1.
- `scriptArguments()` (private): `process.argv.slice(2)`.

## Relationships
The neighbors are scripts under `scripts/contracts/`, `scripts/db/` and `scripts/docs/`, such as the `generate-*` generators, `check-asyncapi-breaking.ts` and `sync-indexes.ts`. They are the likely consumers of these helpers for reading their command-line flags. This file imports only `node:path` and `node:util`, and no other project files.

## Notes
- `process.argv` is read on every call, not once at load time. Tests can set `process.argv` before calling, and `parseArgs`' own default changes shape under `node -e`.
- `flagValue` and `hasFlag` each declare only their own flag, and the other flags are passed through under `strict: false`.
- `requiredPath` treats an empty string value as missing.
