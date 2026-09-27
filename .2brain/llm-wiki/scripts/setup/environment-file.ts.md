---
source: scripts/setup/environment-file.ts
sha256: 6bf7e5dac97d12b716619f62170e2f1bfc9d1dfa16a6c154c9f18d6f5482a0bc
generated_at: 2026-09-27T14:00:12.749892+00:00
model: ollama:qwen3.8:27b
---

# scripts/setup/environment-file.ts

## Purpose

Pure text-level helpers for manipulating a dotenv file's string content: replacing placeholder values with generated secrets and reading a key's current value back. It deliberately performs **no** filesystem I/O — that responsibility belongs to `scripts/setup/index.ts`. Separating text logic from disk I/O keeps these operations trivially testable and reusable.

## Key elements

- **`generateSecret`** (const) – Returns a 64-character hex string from 32 random bytes (`node:crypto`). Chosen so the value contains no `,` or `:` (key-ring separators).
- **`FillResult`** (interface) – Shape returned by `fillPlaceholders`: the new `content` string and `filled`, an array of keys whose lines actually changed (in the order the input `keys` array gave them).
- **`fillPlaceholders(content, keys, secretOf?)`** (const) – For each `{ key, placeholder }` in `keys`, replaces the line that reads *exactly* `KEY=placeholder` with `KEY=<secret>`. Lines whose value has already changed are left alone, making the operation idempotent. The optional `secretOf` parameter defaults to `generateSecret` and exists as a test seam for deterministic values.
- **`readEnvironmentValue(content, key)`** (const) – Returns the value portion of the first line that starts with `KEY=`, or `undefined` if no such line exists.

## Relationships

- **`scripts/setup/index.ts`** – The file-system owner. It reads `.env`, calls `fillPlaceholders` / `readEnvironmentValue` for text work, then writes via temp-file + rename (mode 0600) and copies `.env-example` on first run.
- **`scripts/setup/required-keys.ts`** – Exports the `FillableKey` type (`{ key, placeholder }`) that `fillPlaceholders` iterates over.
- **`tests/unit/scripts/setup/environment-file.test.ts`** – Unit tests for the three exported functions, exercising the `secretOf` override for deterministic assertions.
- **`tests/unit/scripts/setup/first-run.test.ts`** – Covers the first-run flow in `index.ts`, which exercises this module's text helpers as part of the end-to-end setup path.

## Notes

- **Exact-line matching.** `fillPlaceholders` uses `lines.includes(target)` and `line === target`. A line like `# KEY=placeholder` or `KEY=placeholder # comment` will *not* be replaced. Only a line whose entire content is `KEY=placeholder` matches.
- **Idempotent by construction.** Because a filled line no longer reads the placeholder, a second call finds nothing to replace and returns an empty `filled` array.
- **No file I/O here.** If you need to load or save the file, look at `scripts/setup/index.ts`. This module only touches strings.
